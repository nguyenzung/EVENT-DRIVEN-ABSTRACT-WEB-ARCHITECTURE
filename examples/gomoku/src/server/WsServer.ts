import { WebSocketServer, WebSocket } from 'ws';
import { S2C, C2S } from './WsProtocol.js';

interface PlayerState {
  ws: WebSocket;
  playerId: string;
  opponentId: string | null;
  gameId: string | null;
}

function send(ws: WebSocket, msg: S2C): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

export function createServer(port: number): WebSocketServer {
  const wss = new WebSocketServer({ port });
  const players = new Map<string, PlayerState>();
  const waitingQueue: string[] = [];
  let gameCounter = 0;

  console.log(`[Server] Listening on ws://localhost:${port}`);

  wss.on('connection', (ws) => {
    let myId: string | null = null;

    ws.on('message', (raw) => {
      let msg: C2S;
      try {
        msg = JSON.parse(raw.toString()) as C2S;
      } catch {
        return;
      }

      if (msg.type === 'JOIN') {
        // Ensure unique ID — append -1, -2, … if the requested name is taken
        let candidate = msg.playerId;
        let suffix = 1;
        while (players.has(candidate)) candidate = `${msg.playerId}-${suffix++}`;
        myId = candidate;
        players.set(myId, { ws, playerId: myId, opponentId: null, gameId: null });
        console.log(`[Server] Joined: ${myId} (${players.size} online, ${waitingQueue.length} waiting)`);

        // Simple first-come-first-served matchmaking
        const waitingId = waitingQueue.find(id => id !== myId && players.has(id));

        if (waitingId !== undefined) {
          waitingQueue.splice(waitingQueue.indexOf(waitingId), 1);

          const gameId = `game-${++gameCounter}`;
          const blackId = waitingId;   // first to arrive plays Black
          const whiteId = myId;

          players.get(blackId)!.opponentId = whiteId;
          players.get(blackId)!.gameId = gameId;
          players.get(whiteId)!.opponentId = blackId;
          players.get(whiteId)!.gameId = gameId;

          send(players.get(blackId)!.ws, { type: 'GAME_START', gameId, myColor: 'B', opponentId: whiteId });
          send(players.get(whiteId)!.ws, { type: 'GAME_START', gameId, myColor: 'W', opponentId: blackId });

          console.log(`[Server] Game ${gameId} started: Black=${blackId}  White=${whiteId}`);
        } else {
          waitingQueue.push(myId);
          send(ws, { type: 'WAITING', message: 'Waiting for an opponent…' });
        }
        return;
      }

      if (msg.type === 'RELAY') {
        const target = players.get(msg.to);
        if (target) {
          send(target.ws, { type: 'RELAY', from: myId!, message: msg.message });
        }
        return;
      }
    });

    ws.on('close', () => {
      if (!myId) return;
      const state = players.get(myId);
      if (state?.opponentId) {
        const opp = players.get(state.opponentId);
        if (opp) send(opp.ws, { type: 'OPPONENT_DISCONNECTED' });
      }
      const qi = waitingQueue.indexOf(myId);
      if (qi !== -1) waitingQueue.splice(qi, 1);
      players.delete(myId);
      console.log(`[Server] Left: ${myId}`);
    });

    ws.on('error', (err) => {
      console.error(`[Server] Error from ${myId ?? 'unknown'}:`, err.message);
      // Remove zombie entry so the slot doesn't stay blocked
      if (myId) {
        const qi = waitingQueue.indexOf(myId);
        if (qi !== -1) waitingQueue.splice(qi, 1);
        players.delete(myId);
        myId = null;
      }
    });
  });

  return wss;
}
