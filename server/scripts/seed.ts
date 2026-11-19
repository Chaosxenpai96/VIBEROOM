/** Development seed: demo catalog rows, two demo accounts, and a public room with code DEMO01. Never runs in production. */
import "dotenv/config";
import { config } from "../src/config.js";
import { pool } from "../src/db.js";
import { hashPassword } from "../src/lib/crypto.js";
import { demoProvider } from "../src/providers/registry.js";
import { ensureProviderRows, upsertTrack } from "../src/services/catalog.js";
import { runMigrations } from "./migrate.js";

if (config.isProd) { console.error("Refusing to seed demo accounts in production"); process.exit(1); }

await runMigrations(config.databaseUrl);
await ensureProviderRows();
const trackIds: string[] = [];
for (const t of await demoProvider.searchTracks("")) trackIds.push(await upsertTrack(t));

const demoUsers = [
  { email: "demo1@viberoom.dev", name: "Demo Host", color: "#8B5CF6" },
  { email: "demo2@viberoom.dev", name: "Demo Guest", color: "#22D3EE" },
];
const ids: string[] = [];
for (const u of demoUsers) {
  const r = await pool.query(
    `INSERT INTO users (email, display_name, password_hash, avatar_color) VALUES ($1,$2,$3,$4)
     ON CONFLICT (email) DO UPDATE SET display_name=EXCLUDED.display_name RETURNING id`,
    [u.email, u.name, await hashPassword("password123"), u.color]
  );
  ids.push(r.rows[0].id);
}

const room = await pool.query(
  `INSERT INTO rooms (code, name, description, visibility, host_id) VALUES ('DEMO01','Welcome Lounge','Open demo room: join with code DEMO01','PUBLIC',$1)
   ON CONFLICT (code) DO UPDATE SET closed_at=NULL RETURNING id`, [ids[0]]
);
await pool.query(`INSERT INTO room_members (room_id, user_id, role) VALUES ($1,$2,'HOST') ON CONFLICT (room_id, user_id) DO NOTHING`, [room.rows[0].id, ids[0]]);
await pool.query(`INSERT INTO playback_sessions (room_id, player_user_id) VALUES ($1,$2) ON CONFLICT (room_id) DO NOTHING`, [room.rows[0].id, ids[0]]);

console.log("Seeded. Demo accounts (development only):");
for (const u of demoUsers) console.log(`  ${u.email} / password123`);
console.log("Public room code: DEMO01");
await pool.end();
