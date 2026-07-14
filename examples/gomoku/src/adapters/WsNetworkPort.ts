import { WebSocket } from 'ws';
import { NetworkMessage, NetworkPort } from '../contracts.js';
import { C2S, S2C } from '../server/WsProtocol.js';

// Real NetworkPort backed by a WebSocket connection.
// The GameScreen only ever sees the NetworkPort interface — it has no knowledge
// of WebSocket, JSON serialization, or the relay protocol (Rule 11).

export class WsNetworkPort implements NetworkPort {
  private handler: ((from: string, message: NetworkMessage) => void) | null = null;
  private readonly wsListener: (raw: Buffer | string) => void;

  constructor(private readonly ws: WebSocket) {
    this.wsListener = (raw) => {
      let msg: S2C;
      try {
        msg = JSON.parse(raw.toString()) as S2C;
      } catch {
        return;
      }
      if (msg.type === 'RELAY' && this.handler) {
        this.handler(msg.from, msg.message);
      }
    };
    ws.on('message', this.wsListener);
  }

  send(to: string, message: NetworkMessage): void {
    const packet: C2S = { type: 'RELAY', to, message };
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(packet));
    }
  }

  onMessage(handler: (from: string, message: NetworkMessage) => void): () => void {
    this.handler = handler;
    return () => { this.handler = null; };
  }

  dispose(): void {
    this.ws.off('message', this.wsListener);
    this.handler = null;
  }
}
