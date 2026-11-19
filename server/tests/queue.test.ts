import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Socket } from "socket.io-client";
import { api, connect, demoTracks, emit, makeRoom, newUser, startServer, subscribe, waitFor } from "./helpers.js";
import { demoProvider } from "../src/providers/registry.js";

let srv: Awaited<ReturnType<typeof startServer>>;
beforeAll(async () => { srv = await startServer(); });
afterAll(async () => { await srv.close(); });

async function setup(extra: Record<string, unknown> = {}, members = 2) {
  const host = await newUser(srv.url, "Host");
  const room = await makeRoom(srv.url, host.token, extra);
  const users = [host];
  for (let i = 1; i < members; i++) {
    const u = await newUser(srv.url, `Member${i}`);
    await api(srv.url, "POST", "/api/rooms/join", u.token, { code: room.code });
    users.push(u);
  }
  const sockets: Socket[] = [];
  for (const u of users) { const s = await connect(srv.url, u.token); await subscribe(s, room.id); sockets.push(s); }
  const tracks = await demoTracks(srv.url, host.token);
  return { room, users, sockets, tracks, close: () => sockets.forEach((s) => s.close()) };
}
const queueOf = async (url: string, token: string, roomId: string) => (await api(url, "GET", `/api/rooms/${roomId}`, token)).body.queue as any[];

describe("shared queue", () => {
  it("handles simultaneous adds from several clients: nothing lost, positions unique, duplicates rejected", async () => {
    const { room, users, sockets, tracks, close } = await setup({}, 4);
    try {
      // all four add different tracks at once, plus all four race to add the same one
      const diff = sockets.map((s, i) => emit(s, "queue:add", { roomId: room.id, trackId: tracks[i].id }));
      const same = sockets.map((s) => emit(s, "queue:add", { roomId: room.id, trackId: tracks[4].id }));
      const results = await Promise.all([...diff, ...same]);
      expect(results.slice(0, 4).every((r) => r.ok)).toBe(true);
      const sameResults = results.slice(4);
      expect(sameResults.filter((r) => r.ok)).toHaveLength(1);
      expect(sameResults.filter((r) => r.error?.code === "DUPLICATE_TRACK")).toHaveLength(3);
      const q = await queueOf(srv.url, users[0].token, room.id);
      expect(q).toHaveLength(5);
      expect(new Set(q.map((i) => i.position)).size).toBe(5);
    } finally { close(); }
  });

  it("limits how many tracks one member can have waiting (spam protection)", async () => {
    const { room, sockets, tracks, close } = await setup({}, 2);
    try {
      const results = [];
      for (const t of tracks.slice(0, 5)) results.push(await emit(sockets[1], "queue:add", { roomId: room.id, trackId: t.id }));
      expect(results.every((r) => r.ok)).toBe(true); // limit is 5
      const sixth = await emit(sockets[1], "queue:add", { roomId: room.id, trackId: tracks[4].id });
      expect(sixth.ok).toBe(false);
    } finally { close(); }
  });

  it("voting: one vote per member, toggling and switching work, and vote ordering reorders the queue for everyone", async () => {
    const { room, users, sockets, tracks, close } = await setup({ voteOrdering: true }, 3);
    try {
      await emit(sockets[0], "queue:add", { roomId: room.id, trackId: tracks[0].id });
      await emit(sockets[0], "queue:add", { roomId: room.id, trackId: tracks[1].id });
      let q = await queueOf(srv.url, users[0].token, room.id);
      const [first, second] = q;
      expect(first.track.id).toBe(tracks[0].id);

      const seen = waitFor(sockets[2], "room:queue", (d) => d.queue[0].id === second.id && d.queue[0].score === 2);
      expect((await emit(sockets[1], "queue:vote", { roomId: room.id, itemId: second.id, value: 1 })).ok).toBe(true);
      expect((await emit(sockets[2], "queue:vote", { roomId: room.id, itemId: second.id, value: 1 })).ok).toBe(true);
      const reordered = (await seen).queue;
      expect(reordered[0].id).toBe(second.id);
      expect(reordered[0].score).toBe(2);
      expect(reordered[0].upvoterIds).toHaveLength(2);

      // same vote again clears it (cannot stack), opposite vote switches it
      await emit(sockets[1], "queue:vote", { roomId: room.id, itemId: second.id, value: 1 });
      q = await queueOf(srv.url, users[0].token, room.id);
      expect(q.find((i) => i.id === second.id).score).toBe(1);
      await emit(sockets[1], "queue:vote", { roomId: room.id, itemId: second.id, value: -1 });
      q = await queueOf(srv.url, users[0].token, room.id);
      expect(q.find((i) => i.id === second.id).score).toBe(0);
      expect((await emit(sockets[1], "queue:vote", { roomId: room.id, itemId: second.id, value: 5 })).error?.code).toBe("VALIDATION");
    } finally { close(); }
  });

  it("reordering and removal are server-authorized", async () => {
    const { room, users, sockets, tracks, close } = await setup({}, 3);
    try {
      for (const t of tracks.slice(0, 3)) await emit(sockets[1], "queue:add", { roomId: room.id, trackId: t.id });
      let q = await queueOf(srv.url, users[0].token, room.id);
      // plain member cannot reorder; host can
      expect((await emit(sockets[1], "queue:reorder", { roomId: room.id, itemId: q[2].id, toIndex: 0 })).error?.code).toBe("NOT_ALLOWED");
      const seen = waitFor(sockets[1], "room:queue", (d) => d.queue[0].id === q[2].id);
      expect((await emit(sockets[0], "queue:reorder", { roomId: room.id, itemId: q[2].id, toIndex: 0 })).ok).toBe(true);
      expect((await seen).queue.map((i: any) => i.id)).toEqual([q[2].id, q[0].id, q[1].id]);

      q = await queueOf(srv.url, users[0].token, room.id);
      // a different member cannot remove someone else's track; the adder and the host can
      expect((await emit(sockets[2], "queue:remove", { roomId: room.id, itemId: q[0].id })).error?.code).toBe("NOT_ALLOWED");
      expect((await emit(sockets[1], "queue:remove", { roomId: room.id, itemId: q[0].id })).ok).toBe(true);
      expect((await emit(sockets[0], "queue:remove", { roomId: room.id, itemId: q[1].id })).ok).toBe(true);
      expect(await queueOf(srv.url, users[0].token, room.id)).toHaveLength(1);
    } finally { close(); }
  });

  it("host can lock the queue to moderators only", async () => {
    const { room, sockets, tracks, close } = await setup({}, 2);
    try {
      expect((await emit(sockets[1], "room:updateSettings", { roomId: room.id, queuePolicy: "MODERATORS_ONLY" })).error?.code).toBe("HOST_ONLY");
      const settings = waitFor(sockets[1], "room:room", (d) => d.room.queuePolicy === "MODERATORS_ONLY");
      expect((await emit(sockets[0], "room:updateSettings", { roomId: room.id, queuePolicy: "MODERATORS_ONLY" })).ok).toBe(true);
      await settings; // every member is told about the new setting in real time
      expect((await emit(sockets[1], "queue:add", { roomId: room.id, trackId: tracks[0].id })).error?.code).toBe("QUEUE_LOCKED");
      expect((await emit(sockets[0], "queue:add", { roomId: room.id, trackId: tracks[0].id })).ok).toBe(true);
    } finally { close(); }
  });

  it("a non-member cannot touch another room's queue even with a valid session", async () => {
    const { room, tracks, close } = await setup({}, 1);
    try {
      const outsider = await newUser(srv.url, "Outsider");
      const s = await connect(srv.url, outsider.token);
      expect((await emit(s, "queue:add", { roomId: room.id, trackId: tracks[0].id })).error?.code).toBe("NOT_A_MEMBER");
      expect((await emit(s, "playback:play", { roomId: room.id })).error?.code).toBe("NOT_A_MEMBER");
      s.close();
    } finally { close(); }
  });

  it("provider failures: unavailable tracks cannot be queued and search reports the failing provider", async () => {
    const { room, sockets, tracks, close } = await setup({}, 1);
    try {
      demoProvider.failing = true;
      const add = await emit(sockets[0], "queue:add", { roomId: room.id, trackId: tracks[0].id });
      expect(add.error?.code).toBe("TRACK_UNPLAYABLE");
      const search = await api(srv.url, "GET", "/api/tracks/search?q=neon", (await newUser(srv.url)).token);
      expect(search.status).toBe(200);
      expect(search.body.tracks).toHaveLength(0);
      expect(search.body.providerErrors[0].providerId).toBe("demo");
      demoProvider.failing = false;
      expect((await emit(sockets[0], "queue:add", { roomId: room.id, trackId: tracks[0].id })).ok).toBe(true);
    } finally { demoProvider.failing = false; close(); }
  });

  it("search matches title, artist and album", async () => {
    const u = await newUser(srv.url);
    const by = async (q: string) => (await api(srv.url, "GET", `/api/tracks/search?q=${encodeURIComponent(q)}`, u.token)).body.tracks as any[];
    expect((await by("neon")).map((t) => t.title)).toEqual(["Neon Drive"]);
    expect((await by("aurora")).length).toBe(2);
    expect((await by("sing along")).length).toBe(2);
    expect(await by("zzzz-nothing")).toEqual([]);
  });
});
