import http from "node:http";
import os from "node:os";
import { createApp } from "./app.js";
import { config } from "./config.js";
import { pool } from "./db.js";
import { attachRealtime } from "./realtime/socket.js";
import { ensureProviderRows } from "./services/catalog.js";
import { runMigrations } from "../scripts/migrate.js";

await runMigrations(config.databaseUrl);
await ensureProviderRows();

const server = http.createServer(createApp());
const realtime = attachRealtime(server);
server.listen(config.port, "0.0.0.0", () => {
  console.log(`VibeRoom server listening on port ${config.port}`);
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs ?? []) if (a.family === "IPv4" && !a.internal) console.log(`  phones on the same Wi-Fi can use: http://${a.address}:${config.port}`);
  }
});

const shutdown = async () => { await realtime.close(); server.close(); await pool.end(); process.exit(0); };
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
