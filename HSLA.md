# HIERARCHICAL SCREEN-LOOP ARCHITECTURE (HSLA)

## Tree-like Autonomous Screen Architecture with Interface-driven Runtime and Virtual E2E

---

## I. INTRODUCTION & PHILOSOPHY

### 1. Overview
**Hierarchical Screen-Loop Architecture (HSLA)** is a frontend architecture that organizes an application into **tree-like autonomous Screens**. In this architecture, an application is not just a collection of display components; each screen is viewed as an **independent processing cell**, possessing its own local data, event queue, processing loop, UI bridge, and lifecycle.

### 2. Architectural Problems to Solve
Modern frontend applications often struggle with state and side-effect scattering across `useState`, `useEffect`, custom hooks, and global stores. This leads to:
*   **Difficult-to-understand components:** Logic is scattered.
*   **Hidden side effects:** Async flows are hard to trace.
*   **Race conditions:** Simultaneous updates clash in the UI.
*   **AI Risk:** AI Agents easily fix local UI issues but accidentally break broader business logic.

HSLA creates a **Screen cell** structure to isolate these concerns.

### 3. Core Philosophy: Screen as the Main Unit
*   **Screen as an Entity:** Not just an interface, but a full lifecycle entity (init, receive data, process loop, emit effects, flush UI, dispose).
*   **UI as an Endpoint:** A Screen can implement a UI interface to become a node for its parent, while maintaining its own autonomous loop.
*   **Local State Sovereignty:** States like input drafts, temporary validation errors, or open tabs reside strictly within the Screen, preventing "Global Store Bloat."

### 4. Strict Invariant Enforcement
Invariants are the non-negotiable laws of a Screen or Domain Flow. AI Agents are required to treat these as **Hard Constraints (100% adherence)**.
*   **Local Invariants:** e.g., "A form cannot submit if validation errors exist."
*   **Global/Domain Invariants:** e.g., "A signing session cannot complete without approvals from all required parties."
*   **Zero Compromise:** Any AI-proposed change violating these invariants during RAM E2E testing will be automatically rejected.

---

## II. THE ANATOMY OF A SCREEN CELL

### 1. Technical Components
A standard `Screen` is composed of 5 key elements:
*   **ScreenData:** Contains only the data the screen truly owns.
*   **ScreenEvent:** Defines all possible changes (UI clicks, Parent updates, Effect results).
*   **Local Event Queue:** A sequential array that serializes inputs to prevent re-entrancy.
*   **Loop Lifecycle (`drain()`):** The heart of the cell. It must be **synchronous**. It updates data and collects effects to be run.
*   **UI Bridge:** Decouples the screen from frameworks (React, DOM), enabling it to run in `RenderUI` (real app) or `LogicUI` (test).

### 2. General Structure Diagram
```text
┌────────────────────────────── Screen Cell ──────────────────────────────┐
│                                                                          │
│  Parent Data / UI Input / External Signal                                │
│                     │                                                    │
│                     ▼                                                    │
│                dispatch(event)                                           │
│                     │                                                    │
│                     ▼                                                    │
│              Local Event Queue                                           │
│                     │                                                    │
│                     ▼                                                    │
│              drainLoop()                                                 │
│          ┌───────────────────────┐                                       │
│          │ while(queue not empty) │                                       │
│          │   data = reduce(...)   │                                       │
│          │   collect effects      │                                       │
│          └───────────────────────┘                                       │
│                     │                                                    │
│                     ▼                                                    │
│              Atomic Flush                                                │
│                     │                                                    │
│        ┌────────────┴─────────────┐                                      │
│        ▼                          ▼                                      │
│   Render Self                Flush Children                              │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## III. HIERARCHICAL COMMUNICATION

### 1. Parent-Child Event Flow
Interaction is strictly event-driven:
*   **Parent to Child:** Parent dispatches a `PARENT_DATA_CHANGED` event containing a read-only snapshot.
*   **Child to Parent:** Child uses `parentContext.dispatchToParent(event)` to request changes.
*   **Rule:** Child cannot directly mutate parent data.

### 2. System, Domain, and Effect Queues
HSLA organizes logic into specialized queues:
*   **Screen Local Queue:** Processes local UI state.
*   **App Queue:** Processes global app state (auth, network status).
*   **Domain Queue:** Handles critical protocols (signing, recovery). Flows here survive screen unmounting or tab changes.
*   **Effect Queue:** Manages I/O (Storage, Network, WASM) via an **Effect Runner**.

### 3. Interface-driven External APIs
Screens must depend on **Runtime Interfaces** (Ports), not concrete APIs:
```typescript
interface NetworkPort { send(to: string, message: Uint8Array): Promise<void>; ... }
interface StoragePort { read(key: string): Promise<Uint8Array | null>; ... }
```
This abstraction allows the same logic to be tested in a RAM-based simulation by replacing Ports with virtual adapters.

---

## IV. HEADLESS SIMULATION & E2E

### 1. VirtualNetworkHub
A capability that connects multiple app/runtime instances in RAM. It enables AI to:
*   **Simulate stressors:** Latency, packet loss, message reordering.
*   **Verify Distributed Scenarios:** Multi-device coordination and state sync without real networks.

### 2. RAM E2E Environment Diagram
```text
RAM E2E Environment
├── Node A Runtime (App Queue + Screen Queues + Virtual Network Adapter)
│
├── VirtualNetworkHub (Intercepts and routes packets between nodes)
│
└── Node B Runtime (App Queue + Screen Queues + Virtual Network Adapter)
```

### 3. Layered Testing Strategy
*   **Layer 1: Screen Logic Test:** Tests one screen cell in isolation.
*   **Layer 2: Domain Runtime Test:** Tests protocol flows (e.g., signing).
*   **Layer 3: RAM System E2E:** Multi-node simulation via VirtualNetworkHub.
*   **Layer 4: Browser E2E:** Verification of physical UI (CSS, visibility, focus).

---

## V. IMPLEMENTATION GUIDELINES

### 1. The 12 Mandatory Rules
*   **Rule 1:** Each Screen has a dedicated contract (Events, Data).
*   **Rule 2:** Events must have clear union types (No raw strings).
*   **Rule 3:** Data updates must be **Synchronous** (No `await` in reducers).
*   **Rule 4:** Child does not mutate parent.
*   **Rule 5:** UI contains zero business logic (Render, pull input, dispatch).
*   **Rule 6:** Important screens must have `LogicUI` headless tests.
*   **Rule 7:** Dispose all timers/subscriptions in the lifecycle.
*   **Rule 8:** Use `maxSteps` in queues to prevent infinite loops.
*   **Rule 9:** Provide `drainSync` for deterministic testing.
*   **Rule 10:** Side effects must return via events.
*   **Rule 11:** External APIs must go through interfaces (Ports).
*   **Rule 12:** Use `VirtualNetworkHub` for distributed flows.

### 2. Conceptual Template (Abstract Screen)
```typescript
abstract class Screen<LocalData, LocalEvent, ParentData, ParentEvent> implements UI<ParentData> {
  protected data: LocalData;
  protected queue: EventQueue<LocalEvent>;

  constructor(protected parentContext?: ParentContext<ParentData, ParentEvent>) {
    this.data = this.createInitialData(parentContext?.getSnapshot());
    this.queue = new EventQueue<LocalEvent>(
      (event) => {
        const result = this.reduce(this.data, event);
        this.data = result.data;
        this.emitEffects(result.effects);
      },
      () => this.flush()
    );
  }

  public onDataChanged(parentData: ParentData): void {
    const event = this.mapParentDataToEvent(parentData);
    if (event) this.dispatch(event);
  }

  protected abstract reduce(data: LocalData, event: LocalEvent): { data: LocalData; effects: Effect[] };
  // ... rest of implementation
}
```

---

## VI. RELATIONSHIP WITH ED-AWA

HSLA and ED-AWA are complementary:
*   **ED-AWA** (The Organs): Focuses on the absolute correctness of the **Core Runtime** and global protocol logic.
*   **HSLA** (The Skeleton): Focuses on the **Scalability and Organization** of the UI and localized flows.

**Hybrid Approach:** Use HSLA to structure the application tree and embed ED-AWA FSMs inside complex Screens or as Global Domain Runners.

---

## VII. CONCLUSION
HSLA provides the structural guardrails necessary for complex frontend systems to remain deterministic. By isolating logic into autonomous, interface-driven cells, we enable high-fidelity simulation and 100% reliable invariant enforcement for AI-assisted development.
