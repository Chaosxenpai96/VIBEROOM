import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { api, connect, emit, makeRoom, newUser, pool, startServer } from "./helpers.js";

let srv: Awaited<ReturnType<typeof startServer>>;
beforeAll(async () => { srv = await startServer(); });
afterAll(async () => { await srv.close(); });

describe("authentication", () => {
  it("registers, logs in, reads /me, and logs out (token stops working)", async () => {
    const email = `auth${Date.now()}@test.dev`;
    const reg = await api(srv.url, "POST", "/api/auth/register", null, { email, password: "password123!", displayName: "Ann" });
    expect(reg.status).toBe(201);
    const stored = (await pool.query("SELECT password_hash FROM users WHERE email=$1", [email])).rows[0].password_hash as string;
    expect(stored.startsWith("scrypt$")).toBe(true);
    expect(stored).not.toContain("password123");

    const login = await api(srv.url, "POST", "/api/auth/login", null, { email: email.toUpperCase(), password: "password123!" });
    expect(login.status).toBe(200);
    expect((await api(srv.url, "GET", "/api/auth/me", login.body.token)).body.user.email).toBe(email);

    await api(srv.url, "POST", "/api/auth/logout", login.body.token);
    expect((await api(srv.url, "GET", "/api/auth/me", login.body.token)).status).toBe(401);
  });

  it("rejects bad credentials, duplicate emails and weak passwords without leaking which part was wrong", async () => {
    const u = await newUser(srv.url);
    const bad = await api(srv.url, "POST", "/api/auth/login", null, { email: u.email, password: "wrong-password" });
    const nobody = await api(srv.url, "POST", "/api/auth/login", null, { email: "nobody@test.dev", password: "wrong-password" });
    expect(bad.status).toBe(401);
    expect(nobody.status).toBe(401);
    expect(bad.body.error.message).toBe(nobody.body.error.message);
    expect((await api(srv.url, "POST", "/api/auth/register", null, { email: u.email, password: "password123!", displayName: "Dup" })).status).toBe(409);
    expect((await api(srv.url, "POST", "/api/auth/register", null, { email: "x@test.dev", password: "short", displayName: "X" })).status).toBe(400);
  });

  it("password reset sets a new password, is single-use, and revokes old sessions", async () => {
    const u = await newUser(srv.url);
    const req = await api(srv.url, "POST", "/api/auth/password-reset/request", null, { email: u.email });
    const token = req.body.devToken as string;
    expect(token).toBeTruthy();
    expect((await api(srv.url, "POST", "/api/auth/password-reset/confirm", null, { token, password: "brand-new-pass1" })).status).toBe(200);
    expect((await api(srv.url, "POST", "/api/auth/password-reset/confirm", null, { token, password: "another-pass-22" })).status).toBe(400);
    expect((await api(srv.url, "GET", "/api/auth/me", u.token)).status).toBe(401);
    expect((await api(srv.url, "POST", "/api/auth/login", null, { email: u.email, password: "brand-new-pass1" })).status).toBe(200);
    // unknown email gives the same response shape (no enumeration)
    expect((await api(srv.url, "POST", "/api/auth/password-reset/request", null, { email: "ghost@test.dev" })).body.ok).toBe(true);
  });

  it("protects endpoints and sockets without a valid token", async () => {
    expect((await api(srv.url, "GET", "/api/rooms/public")).status).toBe(401);
    expect((await api(srv.url, "GET", "/api/tracks/search?q=a", "garbage")).status).toBe(401);
    await expect(connect(srv.url, "garbage")).rejects.toThrow();
  });
});

describe("rooms", () => {
  it("creates a room with a unique code, host membership, and QR invite; others join by code (case-insensitive)", async () => {
    const host = await newUser(srv.url, "Host");
    const guest = await newUser(srv.url, "Guest");
    const room = await makeRoom(srv.url, host.token, { description: "chill" });
    expect(room.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);

    const invite = await api(srv.url, "GET", `/api/rooms/${room.id}/invite`, host.token);
    expect(invite.body.link).toBe(`viberoom://join/${room.code}`);
    expect(invite.body.qrDataUrl.startsWith("data:image/png;base64,")).toBe(true);

    const j = await api(srv.url, "POST", "/api/rooms/join", guest.token, { code: room.code.toLowerCase() });
    expect(j.status).toBe(200);
    // joining twice is idempotent
    expect((await api(srv.url, "POST", "/api/rooms/join", guest.token, { code: room.code })).status).toBe(200);
    const snap = await api(srv.url, "GET", `/api/rooms/${room.id}`, guest.token);
    expect(snap.body.members.map((m: any) => m.role)).toEqual(["HOST", "MEMBER"]);
  });

  it("private rooms: non-members cannot read state or subscribe; password is enforced; they are not listed publicly", async () => {
    const host = await newUser(srv.url, "Host");
    const outsider = await newUser(srv.url, "Outsider");
    const room = await makeRoom(srv.url, host.token, { visibility: "PRIVATE", password: "secret-pw" });

    expect((await api(srv.url, "GET", `/api/rooms/${room.id}`, outsider.token)).status).toBe(403);
    const s = await connect(srv.url, outsider.token);
    expect((await emit(s, "room:subscribe", { roomId: room.id })).error?.code).toBe("NOT_A_MEMBER");
    s.close();

    expect((await api(srv.url, "POST", "/api/rooms/join", outsider.token, { code: room.code })).body.error.code).toBe("WRONG_PASSWORD");
    expect((await api(srv.url, "POST", "/api/rooms/join", outsider.token, { code: room.code, password: "nope" })).status).toBe(403);
    expect((await api(srv.url, "POST", "/api/rooms/join", outsider.token, { code: room.code, password: "secret-pw" })).status).toBe(200);

    const list = await api(srv.url, "GET", "/api/rooms/public", host.token);
    expect(list.body.rooms.some((r: any) => r.id === room.id)).toBe(false);
    const stored = (await pool.query("SELECT password_hash FROM rooms WHERE id=$1", [room.id])).rows[0].password_hash;
    expect(stored).not.toContain("secret-pw");
  });

  it("enforces max room size and public discovery lists public rooms", async () => {
    const host = await newUser(srv.url, "Host");
    const a = await newUser(srv.url, "A");
    const b = await newUser(srv.url, "B");
    const room = await makeRoom(srv.url, host.token, { maxMembers: 2 });
    expect((await api(srv.url, "POST", "/api/rooms/join", a.token, { code: room.code })).status).toBe(200);
    const full = await api(srv.url, "POST", "/api/rooms/join", b.token, { code: room.code });
    expect(full.status).toBe(409);
    expect(full.body.error.code).toBe("ROOM_FULL");
    expect((await api(srv.url, "GET", "/api/rooms/public", b.token)).body.rooms.some((r: any) => r.id === room.id)).toBe(true);
    expect((await api(srv.url, "POST", "/api/rooms", host.token, { name: "", visibility: "PUBLIC" })).status).toBe(400);
  });

  it("host leaving transfers the host role to the next member; the last member leaving closes the room", async () => {
    const host = await newUser(srv.url, "Host");
    const m = await newUser(srv.url, "Member");
    const room = await makeRoom(srv.url, host.token);
    await api(srv.url, "POST", "/api/rooms/join", m.token, { code: room.code });
    await api(srv.url, "POST", `/api/rooms/${room.id}/leave`, host.token);
    const snap = await api(srv.url, "GET", `/api/rooms/${room.id}`, m.token);
    expect(snap.body.room.hostId).toBe(m.user.id);
    expect(snap.body.members[0].role).toBe("HOST");
    await api(srv.url, "POST", `/api/rooms/${room.id}/leave`, m.token);
    // the room is closed: its code no longer resolves
    expect((await api(srv.url, "POST", "/api/rooms/join", host.token, { code: room.code })).status).toBe(404);
    expect((await pool.query("SELECT closed_at FROM rooms WHERE id=$1", [room.id])).rows[0].closed_at).not.toBeNull();
  });
});
