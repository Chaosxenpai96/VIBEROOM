import pg from "pg";
import { runMigrations } from "../scripts/migrate.js";

const url = process.env.TEST_DATABASE_URL ?? "postgresql://viberoom:viberoom@localhost:5432/viberoom_test";

export default async function setup() {
  const u = new URL(url);
  const dbName = u.pathname.slice(1);
  const admin = new pg.Client({ connectionString: url.replace(`/${dbName}`, "/postgres") });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${dbName}`);
  await admin.end();
  await runMigrations(url);
}
