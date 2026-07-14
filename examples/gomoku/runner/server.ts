import { createServer } from '../src/server/WsServer.js';

const PORT = parseInt(process.env.PORT ?? '3001', 10);
createServer(PORT);
