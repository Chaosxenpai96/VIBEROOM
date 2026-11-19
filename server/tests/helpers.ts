import http from "node:http";
import type { AddressInfo } from "node:net";
import { io as connectIo, type Socket } from "socket.io-client";
import { createApp } from "../src/app.js";
import { pool } from "../src/db.js";
import { resetPresence } from "../src/realtime/presence.js";
import { attachRealtime } from "../src/realtime/socket.js";
import { ensureProviderRows } from "../src/services/catalog.js";

export async function startServer() {
  await ensureProviderRows();
  resetPresence();
  const server = http.createServer(createApp());
  const rt = attachRealtime(server);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { url, close: async () => { await rt.close(); await new Promise((r) => server.close(r)); } };
}

export async function api(url: string, method: string, path: string, token?: string | null, body?: unknown) {
  const res = await fetch(url + path, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json().catch(() => null)) as any };
}

let n = 0;
export async function newUser(url: string, name = "User") {
  const email = `u${Date.now()}${++n}${Math.floor(Math.random() * 1e6)}@test.dev`;
  const r = await api(url, "POST", "/api/auth/register", null, { email, password: "password123!", displayName: name });
  if (r.status !== 201) throw new Error("register failed " + JSON.stringify(r.body));
  return { token: r.body.token as string, user: r.body.user as { id: string; email: string; displayName: string }, email };
}

export const connect = (url: string, token: string): Promise<Socket> =>
  new Promise((resolve, reject) => {
    const s = connectIo(url, { auth: { token }, transports: ["websocket"], reconnection: false });
    s.once("connect", () => resolve(s));
    s.once("connect_error", (e) => reject(e));
  });

export const emit = (s: Socket, event: string, payload: unknown): Promise<{ ok: boolean; data?: any; error?: { code: string; message: string } }> =>
  new Promise((resolve) => s.emit(event, payload, resolve));

export function waitFor<T = any>(s: Socket, event: string, pred: (d: T) => boolean = () => true, ms = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { s.off(event, h); reject(new Error(`timeout waiting for ${event}`)); }, ms);
    const h = (d: T) => { if (pred(d)) { clearTimeout(t); s.off(event, h); resolve(d); } };
    s.on(event, h);
  });
}

export async function demoTracks(url: string, token: string) {
  const r = await api(url, "GET", "/api/tracks/search?q=", token);
  return r.body.tracks as { id: string; title: string; artist: string; availability: { status: string } }[];
}

export async function makeRoom(url: string, token: string, extra: Record<string, unknown> = {}) {
  const r = await api(url, "POST", "/api/rooms", token, { name: "Test Room", visibility: "PUBLIC", ...extra });
  if (r.status !== 201) throw new Error("create room failed " + JSON.stringify(r.body));
  return r.body.room as { id: string; code: string };
}

export async function subscribe(s: Socket, roomId: string) {
  const r = await emit(s, "room:subscribe", { roomId });
  if (!r.ok) throw new Error("subscribe failed " + JSON.stringify(r.error));
  return r.data;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export { pool };
