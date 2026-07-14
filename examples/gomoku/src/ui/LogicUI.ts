import { GameViewModel } from '../contracts.js';
import { GameScreen } from '../screens/GameScreen.js';

// LogicUI — headless UI bridge for testing (HSLA Rule 6).
// Records every ViewModel snapshot emitted by the screen's flush cycle.
// In a real app, replace this with a React useSyncExternalStore bridge.

export class LogicUI {
  private readonly snapshots: GameViewModel[] = [];
  private readonly unsubscribe: () => void;

  constructor(screen: GameScreen) {
    this.unsubscribe = screen.subscribe(vm => {
      this.snapshots.push(vm);
    });
  }

  get latest(): GameViewModel {
    return this.snapshots[this.snapshots.length - 1]!;
  }

  get updateCount(): number {
    return this.snapshots.length;
  }

  allSnapshots(): readonly GameViewModel[] {
    return this.snapshots;
  }

  dispose(): void {
    this.unsubscribe();
  }
}
