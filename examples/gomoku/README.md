# Gomoku — HSLA + ED-AWA Example

Online 2-player Gomoku game, illustrating the **HSLA** and **ED-AWA** architectures:

- `GameScreen` is an independent **Screen Cell**: has its own queue, pure reducer, and no `async/await`.
- Network is abstracted through the `NetworkPort` interface — swap between RAM and real WebSocket without changing game logic.
- E2E tests run entirely in RAM via `VirtualNetworkHub`, no browser or server required.

---

## Installation

```bash
cd examples/gomoku
npm install
```

---

## Method 1 — Play on browser (2 tabs in the same browser)

This is the fastest way to try it out.

**Step 1** — open 2 terminals, run in parallel:

```bash
# Terminal 1: WebSocket relay server
npm run server
```

```bash
# Terminal 2: HTTP server serving HTML files
npm run web
```

**Step 2** — open **2 tabs** in the same browser, both pointing to:

```
http://localhost:3000
```

**Step 3** — in each tab:

1. Enter player name (or leave blank — server generates a random name)
2. Keep the server address as `ws://localhost:3001`
3. Click **Connect & Find Match**

After both tabs connect, the server matches them automatically. The board appears, and the first tab to join will play as **Black (●)**.

> **LAN Play:** replace `localhost` with the host IP in both the server URL and client browser.
>
> **Duplicate names:** if two tabs use the same name, the server automatically adds a suffix (`alice` → `alice-1`).

---

## Method 2 — Play on terminal (CLI)

**Terminal 1** — server:

```bash
npm run server
```

**Terminal 2** — player 1:

```bash
PLAYER_ID=alice npm run client
```

**Terminal 3** — player 2:

```bash
PLAYER_ID=bob npm run client
```

Enter coordinates `row col` (0–14), e.g., `7 7` to place a stone in the center:

```
=== Gomoku  |  You: ● Black  |  YOUR TURN  |  Moves: 0 ===
    0 1 2 3 4 5 6 7 8 91011121314
 0  · · · · · · · · · · · · · · ·
 7  · · · · · · · · · · · · · · ·
...

Your move (row col, e.g. "7 7"):
```

---

## Run tests

```bash
# All (RAM + real WebSocket)
npm test

# RAM E2E only (no server needed)
npm run test:unit

# Server integration only (self-spins up server in process)
npm run test:integration
```

Expected results:

```
[Layer 1] GameScreen local logic
  ✅  initial state: Black moves first, board is empty
  ✅  invariant: cannot place stone when it is not your turn
  ✅  invariant: cannot place stone on an occupied cell
  ✅  turn alternates after each valid move

[Layer 2] VirtualNetworkHub — cross-node sync
  ✅  move placed by Black appears on White's board instantly
  ✅  both boards are in sync after several alternating moves
  ✅  LogicUI (headless) receives flush notifications from network-delivered moves

[Layer 3] RAM E2E — win detection
  ✅  Black wins with 5 horizontal stones in a row
  ✅  White wins with 5 vertical stones
  ✅  Black wins with 5 diagonal stones (↘)
  ✅  Black wins with 5 anti-diagonal stones (↙)
  ✅  invariant: no moves accepted after game is over
  ✅  9-move game: Black wins vertically in column 7
  ✅  move history is preserved on both nodes

[Server Integration — real WebSocket]
  ✅  Two clients connect, receive GAME_START with opposite colors
  ✅  Moves relay correctly through real WebSocket
  ✅  Full game: Black wins with 5 horizontal stones

Results: 17 passed, 0 failed
```

---

## Environment options

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3001` | WebSocket server port |
| `WEB_PORT` | `3000` | HTTP server port (browser) |
| `SERVER_URL` | `ws://localhost:3001` | Server address for CLI client |
| `PLAYER_ID` | random | Player name (CLI) |

---

## File structure

```
public/
  index.html                Browser game client (vanilla JS + Canvas)

src/
  contracts.ts              Core data types: Stone, Board, NetworkPort, Effect…
  EventQueue.ts             Sequential queue, synchronous drain, drainSync(), maxSteps guard
  GameLogic.ts              Pure functions: placeStone, checkWin, checkDraw
  VirtualNetworkHub.ts      In-RAM network for testing (FIFO delivery queue, chaos controls)
  screens/
    GameScreen.ts           Screen Cell: reducer + queue + effect runner + UI bridge
  ui/
    LogicUI.ts              Headless UI bridge — records ViewModel for testing
  adapters/
    WsNetworkPort.ts        Real NetworkPort using WebSocket (Node.js)
  server/
    WsProtocol.ts           Shared S2C / C2S message types
    WsServer.ts             WebSocket relay server + matchmaking

runner/
  server.ts                 Starts WsServer
  web.ts                    HTTP server serving public/index.html
  client.ts                 CLI game client (readline)

e2e/
  game.e2e.ts               14 RAM tests (Layer 1–3)
  server_integration.e2e.ts 3 tests via real WebSocket
```

---

## NetworkPort Diagram

```
                   ┌──── RAM test (e2e) ──┐
                   │   VirtualNetworkHub  │
   GameScreen ─────┤    (in-process)      ├───── GameScreen
   (Black node)    │    latency=0ms       │      (White node)
                   └──────────────────────┘

                   ┌──── Browser / CLI ───┐
                   │      WsServer        │
   GameScreen ─────┤   (relay + match)    ├───── GameScreen
   BrowserNetworkPort│  ws://localhost:3001│    WsNetworkPort
   (index.html)    └──────────────────────┘    (client.ts)
```

`GameScreen` only depends on the `NetworkPort` interface — it doesn't know which transport is being used.

---

## Invariants

| Rule | Enforcement location |
|---|---|
| Cannot move when it's not your turn | `reduce()` — `UI_PLACE_STONE` |
| Cannot place stone on an occupied cell | `reduce()` — `UI_PLACE_STONE` |
| Cannot move after game ends | `reduce()` — all events |
| 5 consecutive stones = win (4 directions) | `GameLogic.checkWin` |

Violation of any invariant -> event is ignored (no-op), state remains unchanged.

---

## HSLA Compliance

Cross-reference source code with 12 mandatory Rules and 5 Screen Cell components in [HSLA.md](../../HSLA.md).

### Demo scope

This demo fully illustrates the **Screen-Loop** part of HSLA: Screen Cell anatomy (§II), Interface-driven Ports (§III.3), VirtualNetworkHub + RAM E2E (§IV), and all 12 Rules (§V). Some parts of HSLA **do not appear** because the app has only a single Screen:

- **§III.1 Parent-Child Event Flow** — no screen tree, so no `PARENT_DATA_CHANGED` / `dispatchToParent`.
- **§III.2 App Queue / Domain Queue** — only Screen Local Queue; effects are run directly via `runEffects()` (sufficient for demo scale).
- **§IV.1 Message reordering** — `VirtualNetworkHub` supports latency and packet loss, does not yet support reorder.

This is a scope limitation, not a violation — related rules (like Rule 4) are satisfied naturally when there is no parent.

### Screen Cell Anatomy (HSLA §II.1)

| Component | File | Status |
|---|---|---|
| **ScreenData** | `contracts.ts` — `GameScreenData` | ✅ |
| **ScreenEvent** | `contracts.ts` — `GameScreenEvent` | ✅ |
| **Local Event Queue** | `EventQueue.ts` — synchronous drain, re-entrancy guard | ✅ |
| **Loop Lifecycle (drain)** | `EventQueue.drain()` — synchronous, collect-then-flush | ✅ |
| **UI Bridge** | `GameScreen.subscribe()` + `LogicUI` / `BrowserNetworkPort` | ✅ |

### 12 Mandatory Rules

| Rule | Description | Status | Notes |
|---|---|---|---|
| **1** | Screen has its own contract (Events, Data) | ✅ | `contracts.ts` defines `GameScreenData`, `GameScreenEvent`, `GameViewModel` |
| **2** | Events are strict union types, no raw strings | ✅ | Prefix `UI_` for user action, `NET_` for network |
| **3** | Data update must be Synchronous | ✅ | `reduce()` is a pure function, no `async/await` |
| **4** | Child does not mutate parent | ✅ | No parent-child in demo (satisfied naturally); reducer always returns a new object via spread |
| **5** | ViewModel is an immutable snapshot | ✅ | `buildViewModel()` returns `board: d.board.map(r => [...r])` — deep copy, no shared reference |
| **6** | Important screens must have LogicUI headless tests | ✅ | `LogicUI` is used in all E2E tests |
| **7** | Dispose all subscriptions in lifecycle | ✅ | `dispose()` calls `disposeNetwork()` + `networkPort.dispose?.()` — ws listener is correctly `ws.off()` |
| **8** | Use `maxSteps` to prevent infinite loops | ✅ | `EventQueue` has `maxSteps = 1000`, throws when exceeded |
| **9** | Provide `drainSync` for deterministic testing | ✅ | `EventQueue.drainSync()` + passthrough `GameScreen.drainSync()` — test can force-flush independently of hub timing |
| **10** | Side effects must return via events | ✅ | Reducer returns `effects[]` as commands; `runEffects()` executes after flush |
| **11** | External API goes through Interface (Ports) | ✅ | `GameScreen` only depends on `NetworkPort` interface — does not import `VirtualNetworkHub` or `ws` |
| **12** | Use `VirtualNetworkHub` for distributed flow | ✅ | 14 RAM E2E tests use `VirtualNetworkHub`; latency path uses FIFO delivery queue |

### Layered Testing (HSLA §IV.3)

| Layer | Description | Status | File |
|---|---|---|---|
| **Layer 1** | Screen Logic Test — single node | ✅ | `game.e2e.ts` — 4 tests |
| **Layer 2** | Domain Runtime Test — protocol flow | N/A | No complex domain protocol in this game |
| **Layer 3** | RAM System E2E — multi-node via VirtualNetworkHub | ✅ | `game.e2e.ts` — 10 tests |
| **Layer 4** | Browser E2E — CSS, visibility, focus | — | Not yet implemented (acceptable for demo) |

Additionally, there are **Server Integration Tests** (not part of the 4 HSLA layers) running via real WebSocket: `server_integration.e2e.ts` — 3 tests.
