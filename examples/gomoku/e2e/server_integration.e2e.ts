/**
 * Server integration test.
 *
 * Spins up a REAL WebSocket server, connects two nodes via real sockets,
 * and plays a complete Gomoku game through the WsNetworkPort adapter.
 *
 * Everything is driven headlessly (no readline, no UI) — but traffic travels
 * through actual JSON-over-WebSocket, not in-process memory.
 */

import { WebSocket } from 'ws';
import { createServer } from '../src/server/WsServer.js';
import { WsNetworkPort } from '../src/adapters/WsNetworkPort.js';
import { GameScreen } from '../src/screens/GameScreen.js';
import { Stone } from '../src/contracts.js';
import { S2C, C2S } from '../src/server/WsProtocol.js';

const PORT = 39999;

// ─── Minimal harness ──────────────────────────────────────────────────────────

let passed = 0, failed = 0;

function test(name: string, fn: () => Promise<void>): Promise<void> {
  return fn().then(() => {
    console.log(`  ✅  ${name}`);
    passed++;
  }).catch((e: Error) => {
    console.error(`  ❌  ${name}`);
    console.error(`      → ${e.message}`);
    failed++;
  });
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface ConnectedClient {
  ws: WebSocket;
  gameScreen: GameScreen;
  port: WsNetworkPort;
  color: Stone;
  dispose: () => void;
}

// Connect a player to the server, wait for GAME_START, return a ready GameScreen.
function connectPlayer(playerId: string): Promise<ConnectedClient> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${PORT}`);

    ws.on('error', reject);

    ws.on('open', () => {
      const join: C2S = { type: 'JOIN', playerId };
      ws.send(JSON.stringify(join));
    });

    ws.on('message', (raw) => {
      const msg: S2C = JSON.parse(raw.toString()) as S2C;
      if (msg.type !== 'GAME_START') return; // ignore WAITING

      const port = new WsNetworkPort(ws);
      const screen = new GameScreen(playerId, msg.opponentId, msg.gameId, msg.myColor, port);

      resolve({
        ws,
        gameScreen: screen,
        port,
        color: msg.myColor,
        dispose() {
          screen.dispose();
          port.dispose();
          ws.close();
        },
      });
    });
  });
}

// Wait until both nodes agree on status, with a timeout.
function waitForStatus(
  a: GameScreen, b: GameScreen,
  status: 'won' | 'draw',
  timeoutMs = 2000
): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = setTimeout(
      () => reject(new Error(`Timed out waiting for status "${status}"`)),
      timeoutMs
    );
    function check() {
      if (a.getViewModel().status === status && b.getViewModel().status === status) {
        clearTimeout(deadline);
        resolve();
      }
    }
    const ua = a.subscribe(check);
    const ub = b.subscribe(check);
    check(); // already there?
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

console.log('\n[Server Integration — real WebSocket]\n');

const wss = createServer(PORT);

// Give the server a tick to bind
await new Promise(r => setTimeout(r, 50));

// ── Test 1 ───────────────────────────────────────────────────────────────────
await test('Two clients connect, receive GAME_START with opposite colors', async () => {
  const [a, b] = await Promise.all([
    connectPlayer('alice'),
    connectPlayer('bob'),
  ]);

  assert(a.color !== b.color, 'Players must have different colors');
  const colors = new Set([a.color, b.color]);
  assert(colors.has('B') && colors.has('W'), 'One must be Black, one White');

  a.dispose();
  b.dispose();
  await new Promise(r => setTimeout(r, 20));
});

// ── Test 2 ───────────────────────────────────────────────────────────────────
await test('Moves relay correctly through real WebSocket', async () => {
  const [a, b] = await Promise.all([
    connectPlayer('carol'),
    connectPlayer('dave'),
  ]);

  const black = a.color === 'B' ? a : b;
  const white = a.color === 'W' ? a : b;

  black.gameScreen.dispatch({ type: 'UI_PLACE_STONE', payload: { row: 7, col: 7 } });

  // Wait a tick for the WebSocket round-trip
  await new Promise(r => setTimeout(r, 50));

  assert(black.gameScreen.getViewModel().board[7][7] === 'B', 'Black sees own stone');
  assert(white.gameScreen.getViewModel().board[7][7] === 'B', 'White received stone via server relay');

  a.dispose();
  b.dispose();
  await new Promise(r => setTimeout(r, 20));
});

// ── Test 3 ───────────────────────────────────────────────────────────────────
await test('Full game: Black wins with 5 horizontal stones', async () => {
  const [a, b] = await Promise.all([
    connectPlayer('eve'),
    connectPlayer('frank'),
  ]);

  const black = a.color === 'B' ? a : b;
  const white = a.color === 'W' ? a : b;

  // Interleave moves, small delay for each WS round-trip
  const moves: Array<[GameScreen, number, number]> = [
    [black.gameScreen, 0, 0], [white.gameScreen, 14, 0],
    [black.gameScreen, 0, 1], [white.gameScreen, 14, 1],
    [black.gameScreen, 0, 2], [white.gameScreen, 14, 2],
    [black.gameScreen, 0, 3], [white.gameScreen, 14, 3],
    [black.gameScreen, 0, 4],  // Black wins
  ];

  for (const [screen, row, col] of moves) {
    screen.dispatch({ type: 'UI_PLACE_STONE', payload: { row, col } });
    await new Promise(r => setTimeout(r, 20)); // wait for relay
  }

  await waitForStatus(black.gameScreen, white.gameScreen, 'won');

  assert(black.gameScreen.getViewModel().winner === 'B', 'Black wins');
  assert(white.gameScreen.getViewModel().winner === 'B', 'White sees Black as winner');

  a.dispose();
  b.dispose();
  await new Promise(r => setTimeout(r, 20));
});

// ── Report ────────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(60)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);

wss.close();
if (failed > 0) process.exit(1);
else console.log('All server integration tests PASSED ✅\n');
