import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Socket } from "socket.io-client";
import { api, connect, demoTracks, emit, makeRoom, newUser, startServer, subscribe, waitFor } from "./helpers.js";

let srv: Awaited<ReturnType<typeof startServer>>;
beforeAll(async () => { srv = await startServer(); });
afterAll(async () => { await srv.close(); });

describe("first acceptance milestone: two clients, one room", () => {
  it("both clients join, see presence, add tracks, and see queue updates in real time", async () => {
    const alice = await newUser(srv.url, "Alice");
    const bob = await newUser(srv.url, "Bob");
    const room = await makeRoom(srv.url, alice.token);

    const joined = await api(srv.url, "POST", "/api/rooms/join", bob.token, { code: room.code });
    expect(joined.status).toBe(200);

    const sa: Socket = await connect(srv.url, alice.token);
    const sb: Socket = await connect(srv.url, bob.token);
    try {
      const snapA = await subscribe(sa, room.id);
      expect(snapA.members.find((m: any) => m.userId === alice.user.id).online).toBe(true);
      expect(snapA.members.find((m: any) => m.userId === bob.user.id).online).toBe(false);

      // Alice sees Bob come online
      const bobOnline = waitFor(sa, "room:members", (d) => d.members.find((m: any) => m.userId === bob.user.id)?.online === true);
      const snapB = await subscribe(sb, room.id);
      await bobOnline;
      expect(snapB.members.every((m: any) => m.online)).toBe(true);

      const tracks = await demoTracks(srv.url, alice.token);
      expect(tracks.length).toBeGreaterThanOrEqual(5);
      expect(tracks[0].availability.status).toBe("playable");

      // Alice adds -> Bob sees it
      const bobSeesQueue = waitFor(sb, "room:queue", (d) => d.queue.length === 1);
      const addA = await emit(sa, "queue:add", { roomId: room.id, trackId: tracks[0].id });
      expect(addA.ok).toBe(true);
      const q1 = (await bobSeesQueue).queue;
      expect(q1[0].track.id).toBe(tracks[0].id);
      expect(q1[0].addedBy.displayName).toBe("Alice");

      // Bob adds -> Alice sees both, with attribution
      const aliceSeesQueue = waitFor(sa, "room:queue", (d) => d.queue.length === 2);
      expect((await emit(sb, "queue:add", { roomId: room.id, trackId: tracks[1].id })).ok).toBe(true);
      const q2 = (await aliceSeesQueue).queue;
      expect(q2.map((i: any) => i.addedBy.displayName)).toEqual(["Alice", "Bob"]);
    } finally {
      sa.close(); sb.close();
    }
  });

  it("a demo track has a real playable audio source that the server actually serves", async () => {
    const u = await newUser(srv.url, "Listener");
    const [t] = await demoTracks(srv.url, u.token);
    const p = await api(srv.url, "GET", `/api/tracks/${t.id}/playback`, u.token);
    expect(p.body.availability.status).toBe("playable");
    expect(p.body.source.kind).toBe("direct-audio");
    const audio = await fetch(srv.url + p.body.source.url, { headers: { range: "bytes=0-1023" } });
    expect(audio.status).toBe(206);
    expect(audio.headers.get("content-type")).toContain("audio/mpeg");
    expect((await audio.arrayBuffer()).byteLength).toBe(1024);
  });
});
