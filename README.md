# Architecture-as-a-Guardrail

An event-driven web architecture designed as an **Architecture-as-a-Guardrail** to optimize collaboration with AI Agents and improve consistency in complex frontend systems.

## 🎯 Shared Key Objective: Deterministic AI Simulation & Task Execution

Both architectural approaches in this repository are designed to make **End-to-End (E2E) testing highly accessible, deterministic, and simulation-friendly**.

The primary goal is to empower AI Agents to **execute complex development tasks with higher reliability** by giving them a runtime where real-world actions, asynchronous flows, and distributed scenarios can be tested in RAM.

A key foundation is the use of explicit interfaces for external APIs such as network, storage, browser APIs, WebSocket, WASM, timers, workers, and device/session APIs. Because these boundaries are interface-driven, real external systems can be replaced by virtual test adapters.

One important example is the **VirtualNetworkHub**, which allows multiple app/runtime instances to communicate inside a controlled RAM-based environment without relying on real networks or flaky browser timing.

This enables AI Agents to:

* **Simulate Real-World Actions:** Execute and verify user interactions, async effects, network latency, packet loss, delayed messages, and out-of-order events.
* **Replicate Distributed Scenarios:** Model multi-node communication, multi-device coordination, relay behavior, and state synchronization.
* **Verify Global Invariants:** Check that system-wide rules remain valid across complex state transitions and failure scenarios.
* **Diagnose & Fix with Confidence:** Identify and resolve bugs in asynchronous or distributed flows without depending entirely on traditional browser E2E tests.

## ⚖️ The Rule of Invariants: 100% Strict Adherence

In this architecture, **Invariants** are the non-negotiable laws of the system. They represent the "Ground Truth" that must remain valid regardless of user actions, network failures, or AI modifications.

**Why this is critical for AI Agents:**
AI often falls into the "Local Optimization Trap"—fixing a local UI bug while accidentally breaking a global rule it doesn't see. By centralizing logic into ED-AWA or HSLA cells, we create a **verification boundary** where:
*   **Zero Compromise:** Every event processed through the Logic Core must be validated against a set of invariant checks.
*   **Automatic Rejection:** If an AI proposes a code change or an event sequence that violates an invariant, the system (via RAM-based tests) will immediately reject it.
*   **Explicit Contracts:** Invariants are not hidden in UI side-effects; they are explicitly defined in the Pure Logic Core, making them easy for AI to read, understand, and follow.

AI Agents are required to treat Invariants as **Hard Constraints (100% adherence)**. A development task or bug fix is only considered complete if all global and local invariants are verified to be preserved across all simulated edge cases.

## 📚 Architectural Approaches

The system is detailed through two complementary documents:

### 1. [ED-AWA: Event-Driven AbstractWeb Architecture](./ED-AWA.md)

Defines the core principles of separating the **Logic Core** from the **UI Layer**.

ED-AWA uses the `UI = f(ViewModel)` model, a Sequential Event Queue, pure controllers/FSMs, and an Effect Runner to make high-risk business logic deterministic, testable, and safer for AI-assisted modification.

It is especially suitable for flows such as multi-device synchronization, signing, recovery, reshare, transaction processing, rollback handling, and protocol-level state machines.

### 2. [HSLA: Hierarchical Screen-Loop Architecture](./HSLA.md)

Defines a way to scale frontend applications through **Tree-like Autonomous Screens**.

Each Screen cell has its own local state, event queue, processing loop, UI bridge, parent context, child screens, and lifecycle. HSLA helps AI Agents work within localized screen-level scopes while still keeping communication explicit and event-driven.

HSLA also encourages external APIs to be accessed through interfaces or effect boundaries, which makes screen logic and domain flows suitable for headless testing and RAM-based simulation.

## 🛠️ How to Choose and Combine

While ED-AWA and HSLA share a common philosophy, they operate at different levels of abstraction. Here is a guide on when to use which, and how to effectively combine them.

### When to use ED-AWA (The Logic Core)
**Best for:** High-risk, complex, distributed, or global state logic.
**Use cases:** 
- Multi-device synchronization protocols.
- Complex transaction flows (e.g., Web3 wallet signing, rollback mechanisms).
- Background services requiring strict Sequential Event Queues and FSMs (Finite State Machines).
- When a single global invariant MUST be protected at all costs.
**Why:** It forces a rigid, central bottleneck (the queue) that makes race conditions impossible, which is perfect for AI agents dealing with high-stakes async logic.

### When to use HSLA (The Scalable Skeleton)
**Best for:** Organizing complex UI structures and localized workflows.
**Use cases:**
- Large applications with hundreds of screens (Dashboards, Admin Panels).
- Multi-step forms or wizards where state is only relevant to that specific flow.
- Preventing the "Global Store Bloat" by keeping transient UI state (e.g., drafts, currently open tabs) local.
**Why:** It provides a "divide and conquer" approach. AI Agents can modify a single Screen Cell (its local queue, data, and UI) without fearing they will accidentally break another unrelated screen.

### 🤝 The Hybrid Approach: Combining ED-AWA and HSLA
For large-scale, complex applications (e.g., a collaborative design tool or a secure multi-device wallet), the best approach is to combine them. 

**How to integrate:**
1. **HSLA as the Macro-Architecture (The Skeleton):** Use HSLA to structure the application's UI hierarchy. Create the tree of `AppScreen -> FeatureScreen -> TabScreen`. This keeps the UI modular and limits the blast radius of UI changes.
2. **ED-AWA as the Micro-Architecture (The Organs):** 
   - **For Global Protocols:** Run an ED-AWA Logic Core globally alongside the Root AppScreen. Child screens communicate with this core via a central App/System Queue.
   - **For Complex Local Flows:** Embed an ED-AWA engine *inside* a specific HSLA Screen. For example, a `TransferScreen` might use a simple HSLA queue for form inputs, but delegate the actual transaction protocol to an internal ED-AWA FSM.

In this hybrid model, HSLA ensures the application scales beautifully, while ED-AWA ensures the critical business logic remains bulletproof and 100% testable in RAM.

## ✅ Summary

ED-AWA and HSLA are complementary.

ED-AWA focuses on **core runtime correctness**.

HSLA focuses on **screen-level scalability and organization**.

Both approaches share the same larger goal: creating deterministic architectural guardrails so AI Agents can simulate, test, and modify complex frontend systems with higher reliability.

---

## 🧪 Examples

### [Gomoku Online](./examples/gomoku)

A fully working 2-player online Gomoku game that demonstrates the architecture end-to-end:

| What | How |
|---|---|
| Screen Cell (HSLA) | `GameScreen` — pure synchronous reducer, local event queue, effect runner |
| Interface-driven network | `NetworkPort` swapped between RAM and real WebSocket without changing game logic |
| RAM E2E (VirtualNetworkHub) | 14 tests, zero I/O, fully deterministic |
| Real WebSocket server | Relay server + auto matchmaking for live play |
| Browser client | Vanilla JS + Canvas, no bundler needed |

**Play in browser — open 2 tabs on the same browser:**

```bash
cd examples/gomoku
npm install

npm run server   # Terminal 1 — WebSocket server on :3001
npm run web      # Terminal 2 — HTTP server on :3000
```

Open `http://localhost:3000` in **2 browser tabs** → enter a name → click **Connect & Find Match**.

**Run tests:**

```bash
cd examples/gomoku
npm test
# 17 tests: 14 RAM E2E + 3 real WebSocket integration
```
