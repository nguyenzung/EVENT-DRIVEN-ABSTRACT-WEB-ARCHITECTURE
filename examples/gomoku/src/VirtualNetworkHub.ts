import { NetworkMessage, NetworkPort } from './contracts.js';

// RAM-based network connecting multiple app instances without a real socket.
// Satisfies Rule 12: use VirtualNetworkHub for distributed E2E flows.
//
// Chaos controls (setLatency / setPacketLossRate) let tests verify resilience
// without touching the real network — fulfilling Layer 3 RAM E2E requirements.

type MessageHandler = (from: string, message: NetworkMessage) => void;
type PendingDelivery = { from: string; to: string; message: NetworkMessage };

export class VirtualNetworkHub {
  private readonly nodes = new Map<string, MessageHandler>();
  private latencyMs = 0;
  private packetLossRate = 0; // 0.0 – 1.0
  private deliveryQueue: PendingDelivery[] = [];
  private deliveryTimer: ReturnType<typeof setTimeout> | null = null;

  // Returns a NetworkPort bound to nodeId.
  // The GameScreen depends only on NetworkPort (Rule 11), never on this class.
  createPortFor(nodeId: string): NetworkPort {
    return {
      send: (to, message) => this.deliver(nodeId, to, message),
      onMessage: (handler) => {
        this.nodes.set(nodeId, handler);
        return () => this.nodes.delete(nodeId);
      },
    };
  }

  private deliver(from: string, to: string, message: NetworkMessage): void {
    if (this.packetLossRate > 0 && Math.random() < this.packetLossRate) {
      console.log(`[VirtualNetworkHub] packet dropped ${from}→${to}`);
      return;
    }
    if (!this.nodes.has(to)) {
      console.warn(`[VirtualNetworkHub] node "${to}" not registered`);
      return;
    }
    if (this.latencyMs === 0) {
      // Synchronous delivery — preserves sequential queue guarantee (Rule 12)
      this.nodes.get(to)!(from, message);
      return;
    }
    // Buffered delivery: queue all pending messages and flush as a batch after
    // latencyMs. FIFO order is preserved. A single shared timer avoids the
    // pitfall of scheduling one setTimeout per message (which could deliver
    // out of order if timer resolution jitters between registrations).
    this.deliveryQueue.push({ from, to, message });
    if (this.deliveryTimer === null) {
      this.deliveryTimer = setTimeout(() => this.flushDeliveries(), this.latencyMs);
    }
  }

  private flushDeliveries(): void {
    this.deliveryTimer = null;
    const batch = this.deliveryQueue.splice(0);
    for (const { from, to, message } of batch) {
      const handler = this.nodes.get(to);
      if (handler) handler(from, message);
    }
    if (this.deliveryQueue.length > 0) {
      this.deliveryTimer = setTimeout(() => this.flushDeliveries(), this.latencyMs);
    }
  }

  // Chaos engineering controls
  setLatency(ms: number): void { this.latencyMs = ms; }
  setPacketLossRate(rate: number): void { this.packetLossRate = rate; }

  dispose(): void {
    this.nodes.clear();
    this.deliveryQueue = [];
    if (this.deliveryTimer !== null) {
      clearTimeout(this.deliveryTimer);
      this.deliveryTimer = null;
    }
  }

  getNodeCount(): number { return this.nodes.size; }
}
