// Shared WebSocket message types between server and clients.
// Kept separate from contracts.ts to avoid coupling game logic with transport.

import { NetworkMessage, Stone } from '../contracts.js';

// Server → Client
export type S2C =
  | { type: 'WAITING'; message: string }
  | { type: 'GAME_START'; gameId: string; myColor: Stone; opponentId: string }
  | { type: 'RELAY'; from: string; message: NetworkMessage }
  | { type: 'OPPONENT_DISCONNECTED' };

// Client → Server
export type C2S =
  | { type: 'JOIN'; playerId: string }
  | { type: 'RELAY'; to: string; message: NetworkMessage };
