// Generic sequential event queue — the heart of every HSLA Screen Cell.
//
// Design invariants:
//   - drain() is synchronous (Rule 3)
//   - effects are collected across the whole drain pass and emitted AFTER flush
//   - isProcessing guards re-entrancy: new events enqueue and wait
//   - maxSteps prevents infinite loops (Rule 8)

export type Reducer<D, E, F> = (data: D, event: E) => { data: D; effects: F[] };

export class EventQueue<D, E, F> {
  private queue: E[] = [];
  private isProcessing = false;
  private steps = 0;

  constructor(
    private data: D,
    private readonly reducer: Reducer<D, E, F>,
    private readonly onFlush: () => void,
    private readonly onEffects: (effects: F[]) => void,
    private readonly maxSteps = 1000
  ) {}

  dispatch(event: E): void {
    this.queue.push(event);
    if (!this.isProcessing) this.drain();
  }

  private drain(): void {
    this.isProcessing = true;
    const allEffects: F[] = [];
    this.steps = 0;

    while (this.queue.length > 0) {
      if (this.steps++ >= this.maxSteps) {
        this.isProcessing = false;
        throw new Error(`EventQueue: maxSteps (${this.maxSteps}) exceeded — possible infinite loop`);
      }
      const event = this.queue.shift()!;
      const result = this.reducer(this.data, event);
      this.data = result.data;
      allEffects.push(...result.effects);
    }

    this.isProcessing = false;
    this.onFlush();                          // atomic UI flush (Rule 9)
    if (allEffects.length > 0) this.onEffects(allEffects);
  }

  getData(): D {
    return this.data;
  }

  // Rule 9: public drainSync() for deterministic testing — lets callers
  // force-flush the queue without relying on hub timing.
  drainSync(): void {
    if (!this.isProcessing && this.queue.length > 0) this.drain();
  }
}
