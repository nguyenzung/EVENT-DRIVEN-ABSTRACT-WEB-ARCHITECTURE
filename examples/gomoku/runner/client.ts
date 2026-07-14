/**
 * CLI client for the Gomoku server.
 * Run two instances in separate terminals to play:
 *
 *   Terminal 1: npm run server
 *   Terminal 2: npm run client
 *   Terminal 3: npm run client
 *
 * Env vars:
 *   SERVER_URL  ws://localhost:3001 (default)
 *   PLAYER_ID   auto-generated if not set
 */

import { WebSocket } from 'ws';
import * as readline from 'readline';
import { WsNetworkPort } from '../src/adapters/WsNetworkPort.js';
import { GameScreen } from '../src/screens/GameScreen.js';
import { printBoard } from '../src/GameLogic.js';
import { Stone } from '../src/contracts.js';
import { S2C, C2S } from '../src/server/WsProtocol.js';

const SERVER_URL = process.env.SERVER_URL ?? 'ws://localhost:3001';
const PLAYER_ID = process.env.PLAYER_ID ?? `player-${Math.random().toString(36).slice(2, 6)}`;

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
let gameScreen: GameScreen | null = null;
let networkPort: WsNetworkPort | null = null;
let myColor: Stone | null = null;
let promptActive = false;

// ─────────────────────────────────────────────────────────────────────────────

function renderBoard(): void {
  if (!gameScreen) return;
  const vm = gameScreen.getViewModel();
  const colorLabel = myColor === 'B' ? '● Black' : '○ White';
  const turnLabel = vm.isMyTurn ? 'YOUR TURN' : "Opponent's turn";

  console.log(`\n=== Gomoku  |  You: ${colorLabel}  |  ${turnLabel}  |  Moves: ${vm.moveCount} ===`);
  console.log(printBoard(vm.board));

  if (vm.status === 'won') {
    console.log(vm.winner === myColor ? '\n🎉  You WON!' : '\n  You lost.');
    cleanup();
  } else if (vm.status === 'draw') {
    console.log('\n  Draw!');
    cleanup();
  } else if (vm.isMyTurn && !promptActive) {
    askForMove();
  }
}

function askForMove(): void {
  promptActive = true;
  rl.question('\nYour move (row col, e.g. "7 7"): ', (input) => {
    promptActive = false;
    if (!gameScreen) return;
    const parts = input.trim().split(/\s+/);
    const row = parseInt(parts[0] ?? '', 10);
    const col = parseInt(parts[1] ?? '', 10);

    if (isNaN(row) || isNaN(col) || row < 0 || row > 14 || col < 0 || col > 14) {
      console.log('  ⚠  Enter two numbers 0–14, e.g.  7 7');
      askForMove();
      return;
    }

    const before = gameScreen.getViewModel().moveCount;
    gameScreen.dispatch({ type: 'UI_PLACE_STONE', payload: { row, col } });
    const after = gameScreen.getViewModel().moveCount;

    if (after === before) {
      // Move was rejected by invariant (occupied cell or wrong turn)
      console.log('  ⚠  Invalid move (cell occupied or not your turn). Try again.');
      askForMove();
    }
    // If valid: the subscribe callback re-renders and decides what to do next
  });
}

let cleaned = false;
function cleanup(): void {
  if (cleaned) return;
  cleaned = true;
  rl.close();
  networkPort?.dispose();
  gameScreen?.dispose();
  ws.close();
}

// ─── WebSocket connection ─────────────────────────────────────────────────────

console.log(`Connecting to ${SERVER_URL} as "${PLAYER_ID}"…`);
const ws = new WebSocket(SERVER_URL);

ws.on('open', () => {
  console.log('Connected. Looking for a game…');
  const join: C2S = { type: 'JOIN', playerId: PLAYER_ID };
  ws.send(JSON.stringify(join));
});

ws.on('message', (raw) => {
  let msg: S2C;
  try {
    msg = JSON.parse(raw.toString()) as S2C;
  } catch {
    return;
  }

  switch (msg.type) {
    case 'WAITING':
      console.log(`  ${msg.message}`);
      break;

    case 'GAME_START': {
      myColor = msg.myColor;
      const colorLabel = myColor === 'B' ? '● Black (goes first)' : '○ White (goes second)';
      console.log(`\nGame started! You are ${colorLabel}`);
      console.log(`Game: ${msg.gameId}  |  Opponent: ${msg.opponentId}`);

      networkPort = new WsNetworkPort(ws);
      gameScreen = new GameScreen(PLAYER_ID, msg.opponentId, msg.gameId, myColor, networkPort);
      gameScreen.subscribe(() => renderBoard());

      renderBoard(); // initial render
      break;
    }

    case 'OPPONENT_DISCONNECTED':
      console.log('\nOpponent disconnected. Game over.');
      cleanup();
      break;

    // RELAY messages are handled by WsNetworkPort listener, not here
  }
});

ws.on('error', (err) => {
  console.error('Connection error:', err.message);
  process.exit(1);
});

ws.on('close', () => {
  rl.close();
  process.exit(0);
});
