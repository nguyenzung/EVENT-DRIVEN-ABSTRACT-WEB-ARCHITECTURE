// ─── Core domain types ────────────────────────────────────────────────────────

export const BOARD_SIZE = 15;
export type Cell = 'B' | 'W' | null;
export type Board = Cell[][];
export type Stone = 'B' | 'W';

// ─── Network protocol (messages between nodes) ────────────────────────────────
// Rule 2: strict union types — no raw strings

export type NetworkMessage =
  | { type: 'PLACE_STONE'; payload: { row: number; col: number; color: Stone; playerId: string } }
  | { type: 'GAME_OVER'; payload: { winner: Stone | null; reason: 'five_in_row' | 'draw' } };

// ─── Effect commands (returned by the pure reducer) ───────────────────────────
// Rule 10: side effects must leave the screen as commands, not direct calls

export type Effect =
  | { type: 'SEND_NETWORK'; to: string; message: NetworkMessage }
  | { type: 'LOG'; message: string };

// ─── Interface-driven port (Rule 11) ─────────────────────────────────────────
// The screen depends on this interface, NOT the concrete VirtualNetworkHub.
// Swap in VirtualNetworkHub for tests, or a real WebSocket adapter in prod.

export interface NetworkPort {
  send(to: string, message: NetworkMessage): void;
  onMessage(handler: (from: string, message: NetworkMessage) => void): () => void;
  dispose?(): void;
}

// ─── GameScreen contract ──────────────────────────────────────────────────────

export interface GameScreenData {
  board: Board;
  currentTurn: Stone;
  status: 'playing' | 'won' | 'draw';
  winner: Stone | null;
  myColor: Stone;
  myId: string;
  opponentId: string;
  gameId: string;
  moveHistory: Array<{ row: number; col: number; color: Stone }>;
}

// Rule 2: events are strict union types with clear prefixes (UI_ / NET_)
export type GameScreenEvent =
  | { type: 'UI_PLACE_STONE'; payload: { row: number; col: number } }
  | { type: 'NET_OPPONENT_PLACED'; payload: { row: number; col: number; color: Stone } }
  | { type: 'NET_GAME_OVER'; payload: { winner: Stone | null; reason: string } };

// ─── Read-only ViewModel emitted to the UI layer ─────────────────────────────
// Rule 5: UI contains zero business logic — it only reads this snapshot

export interface GameViewModel {
  board: Board;
  currentTurn: Stone;
  status: 'playing' | 'won' | 'draw';
  winner: Stone | null;
  myColor: Stone;
  isMyTurn: boolean;
  moveCount: number;
}
