# EVENT-DRIVEN ABSTRACT WEB ARCHITECTURE (ED-AWA)
## System Design Protocol for AI Agent Collaboration

---

## I. CONTEXT & RATIONALE

### 1. The AI Agent Shift
The software engineering landscape is shifting toward AI Agents automating the frontend development lifecycle. While AI can autonomously modify code, complex client-side states (secure multi-party computation, real-time sync, transaction rollbacks) are notoriously difficult to handle. Minor asynchronous logic mistakes can lead to catastrophic data corruption or node inconsistency.

### 2. The "Local Optimization Trap"
AI Agents operate within limited context windows and tend to solve immediate problems by scattering state, abusing reactive hooks for hidden side-effects, and inadvertently breaking global invariants that they cannot see at a macro level.

### 3. Core Philosophy: Stricter Rails, Not Smarter AI
ED-AWA shifts control from "trying to make AI smarter" to "building stricter architectural laws." It strips the UI of any "agency," transforming it into a **Dumb View** and forcing all business logic into a deterministic, 100% testable "black box." It is an **Architecture-as-a-Guardrail**.

---

## II. THE THREE ARCHITECTURAL PILLARS

### 1. Pillar 1: UI = f(ViewModel) — Absolute Display Independence
The application is split into two isolated worlds:
*   **Logic Core (Pure Core):** Receives strictly structured events and outputs a single, immutable **ViewModel**.
*   **Display Layer (Dumb UI):** Acts as a "printer." It renders data from the ViewModel and binds user actions to standardized events dispatched back to the Core.

### 2. Pillar 2: Headless E2E & Virtual Networking — State Isolation
To make E2E testing 100% deterministic and extremely fast, ED-AWA runs tests entirely in RAM by mocking the **Effect Runner** layer.
*   **VirtualNetworkHub:** Intercepts network commands and injects them as input events into other nodes' queues.
*   **Chaos Engineering:** Allows for simulating latency, packet loss, and crashes in-memory to verify **ROLLBACK** logic.

### 3. Pillar 3: Type-Driven Constraints & Strict Invariant Enforcement
*   **Contract First:** AI Agents *must* declare specific **Event Types** in a central contract file before adding features.
*   **The Rule of Invariants:** Invariants are non-negotiable laws (e.g., "A node cannot be 'SYNCING' and 'OFFLINE'"). 
    *   **100% Adherence:** AI must follow invariants strictly.
    *   **Zero Compromise:** Changes violating invariants are automatically rejected via RAM-based verification in the CI/CD pipeline.
*   **Easy E2E Authoring:** Writing tests is trivial; the AI simply translates a business flow into an array of sequential event strings.

---

## III. CORE TECHNICAL SPECIFICATION (THE ANATOMY)

### 1. Sequential Event Queue
*   **Nature:** An internal sequential array protected by a processing lock (`isProcessing`).
*   **Mechanism:** Serializes simultaneous events (clicks, network, storage). An anti-reentrancy loop processes events one-by-one, releasing the lock only after state updates and invariant validation are complete.

### 2. Feature Controllers (FSM)
*   **Nature:** Domain-specific logic handlers or Finite State Machines (FSM).
*   **Mechanism:** **Pure Functions**. They take `CurrentContext` + `AppEvent` and return exactly three things: a `NewContext`, a list of `Effects` (commands), and UI update instructions. Isolated from `async` keywords.

### 3. Component Registry & Store
*   **Nature:** A flat Key-Value store holding the **ViewModel**, indexed by fixed **TargetIDs**.
*   **Mechanism:** Manages raw data structures instead of complex component trees. The UI layer simply "observes" its assigned ID, ensuring targeted re-renders.

### 4. Effect Runner & Adapters
*   **Nature:** The execution environment for "impure" tasks (I/O, Network).
*   **Mechanism:** Maps Controller commands to physical adapters. Results *must* be wrapped into an internal event and pushed back into the Event Queue to update state.

### 5. Future-State Buffering Mechanics
*   **Problem:** Network packets arriving before a node has finished initializing.
*   **Solution:** A `shouldBuffer(event, state)` function stores early events in a `messageBuffer`, which is flushed once the controller transitions to a compatible state.

---

## IV. CONCRETE REACT IMPLEMENTATION

### 1. Strict Data Contract (`src/core/contracts.ts`)
```typescript
export type AppEvent =
    | { type: 'UI_INIT' }
    | { type: 'UI_CLICK_NODE'; payload: { nodeId: string } }
    | { type: 'INT_NETWORK_RESPONSE'; payload: { success: boolean; result?: any } };

export interface NodeListViewModel {
    nodes: Array<{ id: string; name: string; status: 'online' | 'offline' }>;
    selectedId: string | null;
}
```

### 2. The Synchronization Bridge (`src/react/bridge.tsx`)
```typescript
import React, { createContext, useContext, useSyncExternalStore } from 'react';
const EngineContext = createContext<any>(null);

export function useViewModel<T>(targetId: string, selector: (data: any) => T): T {
    const engine = useContext(EngineContext);
    return useSyncExternalStore(
        (onStoreChange) => engine.subscribe(targetId, onStoreChange),
        () => selector(engine.getFromRegistry(targetId))
    );
}

export function useAppDispatch() {
    const engine = useContext(EngineContext);
    return (event: AppEvent) => engine.dispatch(event);
}
```

### 3. Passive UI Layer (`src/react/components/NodeManager.tsx`)
```typescript
export const NodeManager: React.FC = () => {
    const dispatch = useAppDispatch();
    const { nodes, selectedId } = useViewModel("NODE_LIST_PANEL", (vm: NodeListViewModel) => vm);
    
    const handleNodeClick = (id: string) => {
        dispatch({ type: 'UI_CLICK_NODE', payload: { nodeId: id } });
    };

    return (
        <div className="node-grid">
            {nodes.map(node => (
                <div key={node.id} onClick={() => handleNodeClick(node.id)}>
                    <h3>{node.name}</h3>
                    <span className={`status-${node.status}`}>{node.status}</span>
                </div>
            ))}
        </div>
    );
};
```

---

## V. COMPARATIVE ANALYSIS

| Criteria | Traditional Frontend | ED-AWA |
| :--- | :--- | :--- |
| **State Management** | Distributed/Scattered. | Fully Centralized (Logic Core). |
| **AI Risk Level** | **High** (Race conditions). | **Low** (Sequential Queue). |
| **E2E Testing** | Browser-dependent (Flaky). | 100% RAM-based (Deterministic). |
| **UI Flexibility** | Tightly Coupled. | **High** (UI is a function). |
| **Initial Overhead** | Low (Quick start). | Moderate (Requires templates). |

---

## VI. LIMITATIONS & TRADE-OFFS

1.  **UI Physical Blind Spots:** RAM tests cannot detect if CSS hides a button. Approx. 10% traditional UI automation is still maintained for visual verification.
2.  **Overkill for Small Interactions:** For minor UI (dropdowns, toggles), forcing events through the Core creates boilerplate. "Relaxed zones" are allowed for non-critical UI state.

---

## VII. CONCLUSION

ED-AWA provides the deterministic foundation required for AI Agents to safely navigate complex asynchronous and distributed systems. By enforcing strict boundaries and invariant-driven logic, it ensures the system remains resilient regardless of who (or what) is writing the code.
