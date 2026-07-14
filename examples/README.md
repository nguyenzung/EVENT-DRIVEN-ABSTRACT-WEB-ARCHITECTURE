# Examples

Examples illustrating the **HSLA** and **ED-AWA** architectures in practice.

---

## [gomoku](./gomoku) — Online Gomoku

Real-time 2-player Gomoku game, fully illustrating:

- **Screen Cell (HSLA):** `GameScreen` has its own queue, pure reducer, and no `async/await`.
- **Interface-driven Network (Rule 11):** `NetworkPort` is swapped between RAM test and real WebSocket without changing a single line of game logic.
- **VirtualNetworkHub (Rule 12):** E2E tests run entirely in RAM — no browser or real server needed.
- **Real WebSocket Server:** relay server + matchmaking for connecting 2 real players.

### Quick play on browser (2 tabs in the same browser)

```bash
cd gomoku
npm install

# Terminal 1 — WebSocket server
npm run server

# Terminal 2 — HTTP server
npm run web
```

Open `http://localhost:3000` in **2 tabs**, each entering a name → click **Connect & Find Match**.

### Run tests (RAM + real WebSocket)

```bash
cd gomoku
npm test
# → 17 tests: 14 RAM E2E + 3 server integration
```

### Architecture

```
                ┌──── RAM test ────────────┐
                │   VirtualNetworkHub      │
  GameScreen ───┤   (zero I/O, sync)       ├─── GameScreen
                └──────────────────────────┘

                ┌──── Browser / CLI ────────┐
                │   WsServer (relay)        │
  GameScreen ───┤   ws://localhost:3001     ├─── GameScreen
  NetworkPort   └──────────────────────────┘   NetworkPort
```

`GameScreen` only depends on the `NetworkPort` interface — it is completely unaware of which transport is being used.

→ Details: [gomoku/README.md](./gomoku/README.md)
