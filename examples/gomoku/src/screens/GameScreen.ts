import { EventQueue } from '../EventQueue.js';
import {
  GameScreenData, GameScreenEvent, Effect, Stone,
  NetworkMessage, NetworkPort, GameViewModel, Cell,
} from '../contracts.js';
import { createEmptyBoard, placeStone, checkWin, checkDraw } from '../GameLogic.js';

// ─── Pure synchronous reducer (Rules 2, 3) ───────────────────────────────────
// No async/await. Takes current data + event → returns new data + effect list.
// Invariants are enforced HERE, not in the UI.

function reduce(
  data: GameScreenData,
  event: GameScreenEvent
): { data: GameScreenData; effects: Effect[] } {
  switch (event.type) {
    case 'UI_PLACE_STONE': {
      const { row, col } = event.payload;

      // Hard invariants — zero compromise (Rule 4, HSLA §I.4)
      if (data.status !== 'playing') return { data, effects: [] };
      if (data.currentTurn !== data.myColor) return { data, effects: [] };
      if (data.board[row][col] !== null) return { data, effects: [] };

      const newBoard = placeStone(data.board, row, col, data.myColor);
      const won = checkWin(newBoard, row, col, data.myColor);
      const draw = !won && checkDraw(newBoard);
      const nextTurn: Stone = data.myColor === 'B' ? 'W' : 'B';

      const newData: GameScreenData = {
        ...data,
        board: newBoard,
        currentTurn: (!won && !draw) ? nextTurn : data.currentTurn,
        status: won ? 'won' : draw ? 'draw' : 'playing',
        winner: won ? data.myColor : null,
        moveHistory: [...data.moveHistory, { row, col, color: data.myColor }],
      };

      // Effects are commands — the runner executes them after flush (Rule 10)
      const effects: Effect[] = [
        {
          type: 'SEND_NETWORK',
          to: data.opponentId,
          message: { type: 'PLACE_STONE', payload: { row, col, color: data.myColor, playerId: data.myId } },
        },
      ];

      if (newData.status !== 'playing') {
        effects.push({
          type: 'SEND_NETWORK',
          to: data.opponentId,
          message: { type: 'GAME_OVER', payload: { winner: newData.winner, reason: won ? 'five_in_row' : 'draw' } },
        });
      }

      return { data: newData, effects };
    }

    case 'NET_OPPONENT_PLACED': {
      const { row, col, color } = event.payload;
      if (data.status !== 'playing') return { data, effects: [] };
      if (data.board[row][col] !== null) return { data, effects: [] };

      const newBoard = placeStone(data.board, row, col, color);
      const won = checkWin(newBoard, row, col, color);
      const draw = !won && checkDraw(newBoard);
      const nextTurn: Stone = data.currentTurn === 'B' ? 'W' : 'B';

      return {
        data: {
          ...data,
          board: newBoard,
          currentTurn: (!won && !draw) ? nextTurn : data.currentTurn,
          status: won ? 'won' : draw ? 'draw' : 'playing',
          winner: won ? color : null,
          moveHistory: [...data.moveHistory, { row, col, color }],
        },
        effects: [],
      };
    }

    case 'NET_GAME_OVER': {
      // Guard: opponent sends GAME_OVER after PLACE_STONE; we may already be 'won'
      if (data.status !== 'playing') return { data, effects: [] };
      return {
        data: { ...data, status: event.payload.winner ? 'won' : 'draw', winner: event.payload.winner },
        effects: [],
      };
    }
  }
}

// ─── GameScreen Cell (HSLA Screen) ───────────────────────────────────────────
// Owns: local event queue, network subscription, UI subscriber list.
// Does NOT own a React component tree — the UI is a passive subscriber.

export class GameScreen {
  private readonly queue: EventQueue<GameScreenData, GameScreenEvent, Effect>;
  private uiListeners: Array<(vm: GameViewModel) => void> = [];
  private readonly disposeNetwork: () => void;

  constructor(
    myId: string,
    opponentId: string,
    gameId: string,
    myColor: Stone,
    private readonly networkPort: NetworkPort
  ) {
    const initial: GameScreenData = {
      board: createEmptyBoard(),
      currentTurn: 'B',
      status: 'playing',
      winner: null,
      myColor,
      myId,
      opponentId,
      gameId,
      moveHistory: [],
    };

    this.queue = new EventQueue<GameScreenData, GameScreenEvent, Effect>(
      initial,
      reduce,
      () => this.flush(),
      (effects) => this.runEffects(effects)
    );

    // Subscribe to inbound network messages via the port interface (Rule 11)
    this.disposeNetwork = networkPort.onMessage((from, msg) =>
      this.onNetworkMessage(from, msg)
    );
  }

  private onNetworkMessage(from: string, msg: NetworkMessage): void {
    switch (msg.type) {
      case 'PLACE_STONE':
        this.queue.dispatch({
          type: 'NET_OPPONENT_PLACED',
          payload: { row: msg.payload.row, col: msg.payload.col, color: msg.payload.color },
        });
        break;
      case 'GAME_OVER':
        this.queue.dispatch({ type: 'NET_GAME_OVER', payload: msg.payload });
        break;
    }
  }

  private runEffects(effects: Effect[]): void {
    for (const effect of effects) {
      switch (effect.type) {
        case 'SEND_NETWORK':
          this.networkPort.send(effect.to, effect.message);
          break;
        case 'LOG':
          console.log('[GameScreen]', effect.message);
          break;
      }
    }
  }

  // Atomic UI flush — called once after each full drain pass (HSLA §II.1)
  private flush(): void {
    const vm = this.buildViewModel();
    for (const listener of this.uiListeners) listener(vm);
  }

  private buildViewModel(): GameViewModel {
    const d = this.queue.getData();
    return {
      board: d.board.map(r => [...r] as Cell[]),  // Rule 5: immutable snapshot, not a live reference
      currentTurn: d.currentTurn,
      status: d.status,
      winner: d.winner,
      myColor: d.myColor,
      isMyTurn: d.status === 'playing' && d.currentTurn === d.myColor,
      moveCount: d.moveHistory.length,
    };
  }

  // Public API

  dispatch(event: GameScreenEvent): void {
    this.queue.dispatch(event);
  }

  // Rule 9: expose drainSync so tests can force-flush without depending on hub timing
  drainSync(): void {
    this.queue.drainSync();
  }

  getViewModel(): GameViewModel {
    return this.buildViewModel();
  }

  // UI Bridge — RenderUI / LogicUI both use this (Rule 6)
  subscribe(listener: (vm: GameViewModel) => void): () => void {
    this.uiListeners.push(listener);
    return () => {
      this.uiListeners = this.uiListeners.filter(l => l !== listener);
    };
  }

  // Rule 7: dispose all subscriptions in lifecycle
  dispose(): void {
    this.disposeNetwork();
    this.networkPort.dispose?.();
    this.uiListeners = [];
  }
}
