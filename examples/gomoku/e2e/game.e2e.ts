/**
 * RAM E2E — Gomoku game with VirtualNetworkHub
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
import { Stone, BOARD_SIZE } from '../src/contracts.js';

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
      hub.dispose();
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

test('random self-play: 2 bots play random legal moves until terminal state (win or draw max 225 moves), verifying 100% board synchronization at every step', () => {
  const g = createGame('random-self-play-demo');
  let step = 0;
  const maxMoves = BOARD_SIZE * BOARD_SIZE;

  // Pseudo-random generator for this E2E test with fixed seed for repeatability
  let seed = 0x5e1f91a7;
  function randomInt(max: number): number {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return Math.floor((seed / 0x100000000) * max);
  }

  while (g.black.getViewModel().status === 'playing' && step < maxMoves) {
    const blackVm = g.black.getViewModel();

    // Determine current player
    const currentTurn = blackVm.currentTurn;
    const currentScreen = currentTurn === 'B' ? g.black : g.white;

    // Collect all legally available empty cells on the board
    const availableCells: Array<[number, number]> = [];
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (blackVm.board[r][c] === null) {
          availableCells.push([r, c]);
        }
      }
    }

    assert(availableCells.length > 0, `Step ${step}: no available empty cells left, but status is still playing`);

    // Bot picks a random empty cell and places stone
    const [row, col] = availableCells[randomInt(availableCells.length)]!;
    currentScreen.dispatch({ type: 'UI_PLACE_STONE', payload: { row, col } });
    step++;

    // ── 100% Board Synchronization Verification at EVERY step ───────────────
    const updatedBlack = g.black.getViewModel();
    const updatedWhite = g.white.getViewModel();

    // 1. Move count must match step and agree across nodes
    assert(updatedBlack.moveCount === step, `Step ${step}: Black moveCount (${updatedBlack.moveCount}) !== step (${step})`);
    assert(updatedWhite.moveCount === step, `Step ${step}: White moveCount (${updatedWhite.moveCount}) !== step (${step})`);

    // 2. Status & currentTurn must agree across nodes
    assert(updatedBlack.status === updatedWhite.status,
      `Step ${step}: Status mismatch (Black=${updatedBlack.status}, White=${updatedWhite.status})`);
    assert(updatedBlack.currentTurn === updatedWhite.currentTurn,
      `Step ${step}: CurrentTurn mismatch (Black=${updatedBlack.currentTurn}, White=${updatedWhite.currentTurn})`);
    assert(updatedBlack.winner === updatedWhite.winner,
      `Step ${step}: Winner mismatch (Black=${updatedBlack.winner}, White=${updatedWhite.winner})`);

    // 3. Every single cell on the 15x15 board (225 cells) must be 100% identical on both nodes
    let blackStones = 0;
    let whiteStones = 0;
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const cellB = updatedBlack.board[r][c];
        const cellW = updatedWhite.board[r][c];
        assert(cellB === cellW,
          `Step ${step}: Cell (${r},${c}) diverged (Black sees '${cellB}', White sees '${cellW}')`);
        if (cellB === 'B') blackStones++;
        if (cellB === 'W') whiteStones++;
      }
    }

    // 4. Stone counts on board must strictly equal moveCount and respect alternating turn rule
    assert(blackStones + whiteStones === step,
      `Step ${step}: Board stone sum (${blackStones + whiteStones}) !== step (${step})`);
    assert(blackStones === whiteStones || blackStones === whiteStones + 1,
      `Step ${step}: Stone turn balance invalid (Black=${blackStones}, White=${whiteStones})`);
  }

  const finalBlack = g.black.getViewModel();
  const finalWhite = g.white.getViewModel();

  // Final assertions
  assert(finalBlack.status === 'won' || finalBlack.status === 'draw',
    `Game did not conclude: status is '${finalBlack.status}' after ${step} moves`);
  assert(finalBlack.status === finalWhite.status, 'Final status mismatch between nodes');
  assert(finalBlack.winner === finalWhite.winner, 'Final winner mismatch between nodes');

  if (finalBlack.status === 'won') {
    assert(finalBlack.winner === 'B' || finalBlack.winner === 'W', 'Won game must have a winner (B or W)');
  } else {
    assert(finalBlack.status === 'draw' && finalBlack.winner === null && step === maxMoves,
      'Draw game must have null winner and exactly 225 moves');
  }

  // Invariant: no moves can be placed after game over
  const [dummyR, dummyC] = [0, 0];
  g.black.dispatch({ type: 'UI_PLACE_STONE', payload: { row: dummyR, col: dummyC } });
  g.white.dispatch({ type: 'UI_PLACE_STONE', payload: { row: dummyR, col: dummyC } });
  assert(g.black.getViewModel().moveCount === finalBlack.moveCount, 'No moves allowed after game over on Black');
  assert(g.white.getViewModel().moveCount === finalWhite.moveCount, 'No moves allowed after game over on White');

  console.log(`\n  [Random Self-Play Result] Completed in ${step} moves. Status: ${finalBlack.status}. Winner: ${finalBlack.winner ?? 'Draw'}`);
  console.log(`  [Random Self-Play Result] 100% of all 225 cells verified identical across both nodes at all ${step} steps.`);
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
