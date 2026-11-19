import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Socket } from "socket.io-client";
import { api, connect, demoTracks, emit, makeRoom, newUser, sleep, startServer, subscribe, waitFor } from "./helpers.js";

let srv: Awaited<ReturnType<typeof startServer>>;
beforeAll(async () => { srv = await startServer(); });
afterAll(async () => { await srv.close(); });

async function setup() {
  const host = await newUser(srv.url, "Host");
  const guest = await newUser(srv.url, "Guest");
  const room = await makeRoom(srv.url, host.token);
  await api(srv.url, "POST", "/api/rooms/join", guest.token, { code: room.code });
  const sh = await connect(srv.url, host.token); await subscribe(sh, room.id);
  const sg = await connect(srv.url, guest.token); await subscribe(sg, room.id);
  const tracks = await demoTracks(srv.url, host.token);
  return { host, guest, room, sh, sg, tracks, close: () => { sh.close(); sg.close(); } };
}

describe("shared playback", () => {
  it("host controls playback; guests see the same authoritative state and cannot control it", async () => {
    const { room, sh, sg, tracks, close } = await setup();
    try {
      expect((await emit(sh, "playback:play", { roomId: room.id })).error?.code).toBe("QUEUE_EMPTY");
      await emit(sg, "queue:add", { roomId: room.id, trackId: tracks[0].id });
      await emit(sg, "queue:add", { roomId: room.id, trackId: tracks[1].id });

      expect((await emit(sg, "playback:play", { roomId: room.id })).error?.code).toBe("NOT_ALLOWED");

      const guestSees = waitFor(sg, "room:playback", (d) => d.playback.state === "PLAYING");
      const play = await emit(sh, "playback:play", { roomId: room.id });
      expect(play.data.playback.state).toBe("PLAYING");
      const seen = (await guestSees).playback;
      expect(seen.trackId).toBe(tracks[0].id);
      expect(seen.positionMs).toBe(0);
      expect(typeof seen.serverTimeMs).toBe("number");

      // pause freezes position using the server clock; seek moves it
      await sleep(300);
      const paused = (await emit(sh, "playback:pause", { roomId: room.id })).data.playback;
      expect(paused.state).toBe("PAUSED");
      expect(paused.positionMs).toBeGreaterThanOrEqual(250);
      expect(paused.positionMs).toBeLessThan(1500);
      const sought = (await emit(sh, "playback:seek", { roomId: room.id, positionMs: 20000 })).data.playback;
      expect(sought.positionMs).toBe(20000);
      expect(sought.state).toBe("PAUSED");
      const resumed = (await emit(sh, "playback:play", { roomId: room.id })).data.playback;
      expect(resumed.state).toBe("PLAYING");
      expect(resumed.positionMs).toBe(20000);
      expect(resumed.version).toBeGreaterThan(paused.version);
    } finally { close(); }
  });

  it("next advances the queue; the final track ending stops playback; completion reports are player-only and idempotent", async () => {
    const { host, room, sh, sg, tracks, close } = await setup();
    try {
      await emit(sh, "queue:add", { roomId: room.id, trackId: tracks[0].id });
      await emit(sh, "queue:add", { roomId: room.id, trackId: tracks[1].id });
      const p1 = (await emit(sh, "playback:play", { roomId: room.id })).data.playback;
      expect(p1.player_user_id ?? p1.playerUserId).toBe(host.user.id);

      // a non-player cannot report completion
      expect((await emit(sg, "playback:ended", { roomId: room.id, queueItemId: p1.queueItemId })).error?.code).toBe("NOT_PLAYER");

      // the player reports the end twice (duplicate request): advances exactly once
      const [e1, e2] = await Promise.all([
        emit(sh, "playback:ended", { roomId: room.id, queueItemId: p1.queueItemId }),
        emit(sh, "playback:ended", { roomId: room.id, queueItemId: p1.queueItemId }),
      ]);
      expect(e1.ok && e2.ok).toBe(true);
      const state = (await api(srv.url, "GET", `/api/rooms/${room.id}`, host.token)).body;
      expect(state.playback.trackId).toBe(tracks[1].id);
      expect(state.queue.map((i: any) => i.status)).toEqual(["PLAYING"]);

      // last track ends -> stopped, queue empty
      await emit(sh, "playback:ended", { roomId: room.id, queueItemId: state.playback.queueItemId });
      const done = (await api(srv.url, "GET", `/api/rooms/${room.id}`, host.token)).body;
      expect(done.playback.state).toBe("STOPPED");
      expect(done.queue).toHaveLength(0);
    } finally { close(); }
  });

  it("previous restarts the current track; next skips; the player device can be reassigned by the host", async () => {
    const { guest, room, sh, sg, tracks, close } = await setup();
    try {
      await emit(sh, "queue:add", { roomId: room.id, trackId: tracks[0].id });
      await emit(sh, "queue:add", { roomId: room.id, trackId: tracks[1].id });
      await emit(sh, "playback:play", { roomId: room.id });
      await emit(sh, "playback:seek", { roomId: room.id, positionMs: 15000 });
      expect((await emit(sh, "playback:previous", { roomId: room.id })).data.playback.positionMs).toBe(0);
      expect((await emit(sh, "playback:next", { roomId: room.id })).data.playback.trackId).toBe(tracks[1].id);

      expect((await emit(sg, "room:setPlayer", { roomId: room.id, userId: guest.user.id })).error?.code).toBe("NOT_ALLOWED");
      expect((await emit(sh, "room:setPlayer", { roomId: room.id, userId: guest.user.id })).data.playback.playerUserId).toBe(guest.user.id);
    } finally { close(); }
  });

  it("a track the player cannot play is skipped with an activity message instead of pretending to play", async () => {
    const { room, sh, tracks, close } = await setup();
    try {
      await emit(sh, "queue:add", { roomId: room.id, trackId: tracks[0].id });
      await emit(sh, "queue:add", { roomId: room.id, trackId: tracks[1].id });
      const p = (await emit(sh, "playback:play", { roomId: room.id })).data.playback;
      const activity = waitFor(sh, "room:activity", (d) => d.entry.text.startsWith("Skipped"));
      const after = (await emit(sh, "playback:error", { roomId: room.id, queueItemId: p.queueItemId, message: "source returned 404" })).data.playback;
      expect(after.trackId).toBe(tracks[1].id);
      expect((await activity).entry.text).toContain("source returned 404");
    } finally { close(); }
  });
});

describe("reconnection and host handover", () => {
  it("a client that drops and reconnects gets the latest authoritative state, including changes made while it was away", async () => {
    const { host, guest, room, sh, sg, tracks, close } = await setup();
    try {
      sg.close();
      await sleep(100);
      await emit(sh, "queue:add", { roomId: room.id, trackId: tracks[2].id });
      await emit(sh, "playback:play", { roomId: room.id });

      const again = await connect(srv.url, guest.token);
      const snap = await subscribe(again, room.id);
      expect(snap.queue).toHaveLength(1);
      expect(snap.playback.state).toBe("PLAYING");
      expect(snap.members.find((m: any) => m.userId === guest.user.id).online).toBe(true);
      // and gets live updates again
      const next = waitFor(again, "room:queue", (d) => d.queue.length === 2);
      await emit(sh, "queue:add", { roomId: room.id, trackId: tracks[3].id });
      await next;
      again.close();
      void host;
    } finally { close(); }
  });

  it("presence goes offline on disconnect, and a host who reconnects within the grace period keeps the role", async () => {
    const { host, guest, room, sh, sg, close } = await setup();
    try {
      const offline = waitFor(sg, "room:members", (d) => d.members.find((m: any) => m.userId === host.user.id)?.online === false);
      sh.close();
      await offline;
      const back = await connect(srv.url, host.token);
      await subscribe(back, room.id);
      await sleep(700); // > HOST_GRACE_MS (400)
      expect((await api(srv.url, "GET", `/api/rooms/${room.id}`, guest.token)).body.room.hostId).toBe(host.user.id);
      back.close();
    } finally { close(); }
  });

  it("when the host stays disconnected past the grace period an online member becomes host and takes over the player", async () => {
    const { host, guest, room, sh, sg, tracks, close } = await setup();
    try {
      await emit(sh, "queue:add", { roomId: room.id, trackId: tracks[0].id });
      await emit(sh, "playback:play", { roomId: room.id });
      const newHost = waitFor(sg, "room:host", (d) => d.hostId === guest.user.id, 4000);
      sh.close();
      await newHost;
      const state = (await api(srv.url, "GET", `/api/rooms/${room.id}`, guest.token)).body;
      expect(state.room.hostId).toBe(guest.user.id);
      expect(state.playback.playerUserId).toBe(guest.user.id);
      expect(state.members.find((m: any) => m.userId === guest.user.id).role).toBe("HOST");
      expect(state.members.find((m: any) => m.userId === host.user.id).role).toBe("MODERATOR");
      // the new host can now control playback
      expect((await emit(sg, "playback:pause", { roomId: room.id })).ok).toBe(true);
    } finally { close(); }
  });
});
