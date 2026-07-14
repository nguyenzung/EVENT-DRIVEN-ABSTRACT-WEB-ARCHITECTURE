/**
 * RAM E2E — Gomoku game with VirtualNetworkHub
 */

 * Tests are organized by HSLA/ED-AWA layered testing strategy:
 *   Layer 1  GameScreen logic in isolation
 *   Layer 2  VirtualNetworkHub: board sync across two nodes
 *   Layer 3  RAM E2E: full game scenarios (win, draw-prevention, invariants)
 *
 * No browser, no real network. Everything runs synchronously in RAM.
 */

import { VirtualNetworkHub } from '../src/VirtualNetworkHub.js';
import { GameScreen } from '../src/screens/GameScreen.js';
import { LogicUI } from '../src/ui/LogicUI.js';
import { printBoard } from '../src/GameLogic.js';
import { Stone } from '../src/contracts.js';

// ─── Minimal test harness ─────────────────────────────────────────────────────

let passed = 0, failed = 0;
let currentSuite = '';

function suite(name: string): void {
  currentSuite = name;
  console.log(`\n${name}`);
}

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`  ✅  ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ❌  ${name}`);
    console.error(`      → ${(e as Error).message}`);
    failed++;
  }
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

// ─── Test fixture ─────────────────────────────────────────────────────────────

interface GameFixture {
  hub: VirtualNetworkHub;
  black: GameScreen;   // plays 'B'
  white: GameScreen;   // plays 'W'
  uiBlack: LogicUI;
  uiWhite: LogicUI;
  dispose: () => void;
}

function createGame(gameId = 'game-001'): GameFixture {
  const hub = new VirtualNetworkHub();

  const portBlack = hub.createPortFor('black');
  const portWhite = hub.createPortFor('white');

  const black = new GameScreen('black', 'white', gameId, 'B', portBlack);
  const white = new GameScreen('white', 'black', gameId, 'W', portWhite);

  const uiBlack = new LogicUI(black);
  const uiWhite = new LogicUI(white);

  return {
    hub, black, white, uiBlack, uiWhite,
    dispose() {
      uiBlack.dispose();
      uiWhite.dispose();
      black.dispose();
      white.dispose();
    },
  };
}

// Helper: drive a sequence of moves  [color, row, col]
function playMoves(
  { black, white }: GameFixture,
  moves: Array<[Stone, number, number]>
): void {
  for (const [color, row, col] of moves) {
    const screen = color === 'B' ? black : white;
    screen.dispatch({ type: 'UI_PLACE_STONE', payload: { row, col } });
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Layer 1 — GameScreen logic (single node)
// ═════════════════════════════════════════════════════════════════════════════

suite('[Layer 1] GameScreen local logic');

test('initial state: Black moves first, board is empty', () => {
  const g = createGame();
  const vm = g.black.getViewModel();
  assert(vm.currentTurn === 'B', 'First turn must be Black');
  assert(vm.isMyTurn === true, 'Black is the first mover');
  assert(vm.status === 'playing', 'Game must start in playing state');
  assert(vm.moveCount === 0, 'Zero moves on start');
  assert(g.white.getViewModel().isMyTurn === false, 'White must wait');
  g.dispose();
});

test('invariant: cannot place stone when it is not your turn', () => {
  const g = createGame();
  // White tries to go first — must be rejected
  g.white.dispatch({ type: 'UI_PLACE_STONE', payload: { row: 7, col: 7 } });
  assert(g.white.getViewModel().board[7][7] === null, 'Move rejected: not White\'s turn');
  assert(g.white.getViewModel().moveCount === 0, 'Move count unchanged');
  g.dispose();
});

test('invariant: cannot place stone on an occupied cell', () => {
  const g = createGame();
  g.black.dispatch({ type: 'UI_PLACE_STONE', payload: { row: 7, col: 7 } });
  // White tries the same cell
  g.white.dispatch({ type: 'UI_PLACE_STONE', payload: { row: 7, col: 7 } });
  assert(g.white.getViewModel().board[7][7] === 'B', 'Cell must remain Black');
  assert(g.white.getViewModel().moveCount === 1, 'Only one legal move was recorded');
  g.dispose();
});

test('turn alternates after each valid move', () => {
  const g = createGame();
  assert(g.black.getViewModel().isMyTurn, 'Black goes first');
  g.black.dispatch({ type: 'UI_PLACE_STONE', payload: { row: 7, col: 7 } });
  assert(!g.black.getViewModel().isMyTurn, 'After Black moves: not Black\'s turn');
  g.white.dispatch({ type: 'UI_PLACE_STONE', payload: { row: 7, col: 8 } });
  assert(g.black.getViewModel().isMyTurn, 'After White moves: Black\'s turn again');
  g.dispose();
});

// ═════════════════════════════════════════════════════════════════════════════
// Layer 2 — VirtualNetworkHub: cross-node board synchronisation
// ═════════════════════════════════════════════════════════════════════════════

suite('[Layer 2] VirtualNetworkHub — cross-node sync');

test('move placed by Black appears on White\'s board instantly', () => {
  const g = createGame();
  g.black.dispatch({ type: 'UI_PLACE_STONE', payload: { row: 3, col: 5 } });

  assert(g.black.getViewModel().board[3][5] === 'B', 'Black sees own stone');
  assert(g.white.getViewModel().board[3][5] === 'B', 'White receives stone via hub');
  g.dispose();
});

test('both boards are in sync after several alternating moves', () => {
  const g = createGame();
  playMoves(g, [
    ['B', 7, 7], ['W', 7, 8],
    ['B', 8, 7], ['W', 8, 8],
  ]);

  const b = g.black.getViewModel().board;
  const w = g.white.getViewModel().board;

  assert(b[7][7] === 'B' && w[7][7] === 'B', '(7,7) is Black on both boards');
  assert(b[7][8] === 'W' && w[7][8] === 'W', '(7,8) is White on both boards');
  assert(b[8][7] === 'B' && w[8][7] === 'B', '(8,7) is Black on both boards');
  assert(b[8][8] === 'W' && w[8][8] === 'W', '(8,8) is White on both boards');
  g.dispose();
});

test('LogicUI (headless) receives flush notifications from network-delivered moves', () => {
  const g = createGame();
  // Black places → White's LogicUI should get a notification via the hub
  g.black.dispatch({ type: 'UI_PLACE_STONE', payload: { row: 3, col: 3 } });

  assert(g.uiBlack.updateCount >= 1, `Black LogicUI: expected ≥1 update, got ${g.uiBlack.updateCount}`);
  assert(g.uiWhite.updateCount >= 1, `White LogicUI: expected ≥1 update (via network), got ${g.uiWhite.updateCount}`);
  g.dispose();
});

// ═════════════════════════════════════════════════════════════════════════════
// Layer 3 — RAM E2E: win detection + post-game invariants
// ═════════════════════════════════════════════════════════════════════════════

suite('[Layer 3] RAM E2E — win detection');

test('Black wins with 5 horizontal stones in a row', () => {
  const g = createGame();
  playMoves(g, [
    ['B', 0, 0], ['W', 14, 0],
    ['B', 0, 1], ['W', 14, 1],
    ['B', 0, 2], ['W', 14, 2],
    ['B', 0, 3], ['W', 14, 3],
    ['B', 0, 4],               // ← winning move
  ]);

  assert(g.black.getViewModel().status === 'won', 'Black status: won');
  assert(g.black.getViewModel().winner === 'B', 'Black winner: B');
  assert(g.white.getViewModel().status === 'won', 'White status: won (sees same result)');
  assert(g.white.getViewModel().winner === 'B', 'White winner field: B');
  g.dispose();
});

test('White wins with 5 vertical stones', () => {
  const g = createGame();
  // Black plays every-other column in row 0 — no 5 consecutive, so Black cannot win
  playMoves(g, [
    ['B', 0, 0], ['W', 2, 7],
    ['B', 0, 2], ['W', 3, 7],
    ['B', 0, 4], ['W', 4, 7],
    ['B', 0, 6], ['W', 5, 7],
    ['B', 0, 8], ['W', 6, 7], // ← White: rows 2-6 in col 7 → 5 vertical
  ]);

  assert(g.white.getViewModel().status === 'won', 'White status: won');
  assert(g.white.getViewModel().winner === 'W', 'White winner: W');
  assert(g.black.getViewModel().winner === 'W', 'Black sees W as winner');
  g.dispose();
});

test('Black wins with 5 diagonal stones (↘)', () => {
  const g = createGame();
  playMoves(g, [
    ['B', 0, 0], ['W', 14, 0],
    ['B', 1, 1], ['W', 14, 1],
    ['B', 2, 2], ['W', 14, 2],
    ['B', 3, 3], ['W', 14, 3],
    ['B', 4, 4],               // ← diagonal win
  ]);

  assert(g.black.getViewModel().status === 'won', 'Black wins diagonally');
  assert(g.black.getViewModel().winner === 'B', 'Winner: B');
  g.dispose();
});

test('Black wins with 5 anti-diagonal stones (↙)', () => {
  const g = createGame();
  playMoves(g, [
    ['B', 0, 4], ['W', 14, 0],
    ['B', 1, 3], ['W', 14, 1],
    ['B', 2, 2], ['W', 14, 2],
    ['B', 3, 1], ['W', 14, 3],
    ['B', 4, 0],               // ← anti-diagonal win
  ]);

  assert(g.black.getViewModel().status === 'won', 'Black wins anti-diagonally');
  assert(g.black.getViewModel().winner === 'B', 'Winner: B');
  g.dispose();
});

test('invariant: no moves accepted after game is over', () => {
  const g = createGame();
  playMoves(g, [
    ['B', 0, 0], ['W', 14, 0],
    ['B', 0, 1], ['W', 14, 1],
    ['B', 0, 2], ['W', 14, 2],
    ['B', 0, 3], ['W', 14, 3],
    ['B', 0, 4],               // Black wins
  ]);

  assert(g.black.getViewModel().status === 'won', 'Pre-condition: game won');

  // Both try to place after game ends
  g.white.dispatch({ type: 'UI_PLACE_STONE', payload: { row: 5, col: 5 } });
  g.black.dispatch({ type: 'UI_PLACE_STONE', payload: { row: 5, col: 6 } });

  assert(g.white.getViewModel().board[5][5] === null, 'Post-win White move ignored');
  assert(g.black.getViewModel().board[5][6] === null, 'Post-win Black move ignored');
  g.dispose();
});

// ═════════════════════════════════════════════════════════════════════════════
// Layer 3 — Full game simulation with board printout
// ═════════════════════════════════════════════════════════════════════════════

suite('[Layer 3] Full game simulation');

test('9-move game: Black wins vertically in column 7', () => {
  const g = createGame();

  // Black occupies col 7, rows 6-10 interleaved with White's col-8 moves
  playMoves(g, [
    ['B',  7, 7], ['W',  7, 8],
    ['B',  8, 7], ['W',  8, 8],
    ['B',  6, 7], ['W',  6, 8],
    ['B',  9, 7], ['W',  9, 8],
    ['B', 10, 7],               // rows 6,7,8,9,10 in col 7 → Black wins
  ]);

  const vm = g.black.getViewModel();
  console.log('\nFinal board:');
  console.log(printBoard(vm.board));
  console.log(`Status: ${vm.status}  |  Winner: ${vm.winner ?? 'none'}  |  Moves: ${vm.moveCount}`);

  assert(vm.status === 'won', `Expected 'won', got '${vm.status}'`);
  assert(vm.winner === 'B', `Expected winner 'B', got '${vm.winner}'`);
  assert(g.white.getViewModel().winner === 'B', 'White node sees same winner');
  g.dispose();
});

test('move history is preserved on both nodes', () => {
  const g = createGame();
  playMoves(g, [
    ['B', 7, 7], ['W', 7, 8],
    ['B', 8, 7],
  ]);

  assert(g.black.getViewModel().moveCount === 3, 'Black sees 3 moves');
  assert(g.white.getViewModel().moveCount === 3, 'White sees 3 moves');
  g.dispose();
});

// ═════════════════════════════════════════════════════════════════════════════
// Summary
// ═════════════════════════════════════════════════════════════════════════════

console.log(`\n${'─'.repeat(60)}`);
console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log('All tests PASSED ✅\n');
}
