import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { api, connect, demoTracks, emit, makeRoom, newUser, startServer, subscribe } from "./helpers.js";

let srv: Awaited<ReturnType<typeof startServer>>;
beforeAll(async () => { srv = await startServer(); });
afterAll(async () => { await srv.close(); });

describe("personal library (separate from room queues)", () => {
  it("favorites toggle, playlists hold tracks in order, and playlists are private to their owner", async () => {
    const a = await newUser(srv.url, "A");
    const b = await newUser(srv.url, "B");
    const t = await demoTracks(srv.url, a.token);

    expect((await api(srv.url, "PUT", `/api/library/favorites/${t[0].id}`, a.token)).status).toBe(200);
    await api(srv.url, "PUT", `/api/library/favorites/${t[0].id}`, a.token); // idempotent
    expect((await api(srv.url, "GET", "/api/library/favorites", a.token)).body.tracks).toHaveLength(1);
    expect((await api(srv.url, "GET", "/api/library/favorites", b.token)).body.tracks).toHaveLength(0);
    await api(srv.url, "DELETE", `/api/library/favorites/${t[0].id}`, a.token);
    expect((await api(srv.url, "GET", "/api/library/favorite-ids", a.token)).body.ids).toEqual([]);

    const pl = (await api(srv.url, "POST", "/api/library/playlists", a.token, { name: "Road trip" })).body.playlist;
    await api(srv.url, "POST", `/api/library/playlists/${pl.id}/tracks`, a.token, { trackId: t[2].id });
    await api(srv.url, "POST", `/api/library/playlists/${pl.id}/tracks`, a.token, { trackId: t[1].id });
    expect((await api(srv.url, "POST", `/api/library/playlists/${pl.id}/tracks`, a.token, { trackId: t[1].id })).status).toBe(409);
    const detail = await api(srv.url, "GET", `/api/library/playlists/${pl.id}`, a.token);
    expect(detail.body.tracks.map((x: any) => x.id)).toEqual([t[2].id, t[1].id]);
    expect((await api(srv.url, "GET", `/api/library/playlists/${pl.id}`, b.token)).status).toBe(404);
    expect((await api(srv.url, "GET", "/api/library/playlists", a.token)).body.playlists[0].trackCount).toBe(2);
  });

  it("a room track starting is recorded in recently played for the room's members, and the profile can be edited", async () => {
    const host = await newUser(srv.url, "Host");
    const room = await makeRoom(srv.url, host.token);
    const s = await connect(srv.url, host.token); await subscribe(s, room.id);
    const t = await demoTracks(srv.url, host.token);
    await emit(s, "queue:add", { roomId: room.id, trackId: t[3].id });
    await emit(s, "playback:play", { roomId: room.id });
    const recent = await api(srv.url, "GET", "/api/library/recent", host.token);
    expect(recent.body.tracks.map((x: any) => x.id)).toEqual([t[3].id]);
    s.close();

    const upd = await api(srv.url, "PATCH", "/api/auth/me", host.token, { displayName: "Renamed", bio: "hello", avatarColor: "#22D3EE" });
    expect(upd.body.user.displayName).toBe("Renamed");
    expect((await api(srv.url, "PATCH", "/api/auth/me", host.token, { avatarColor: "red" })).status).toBe(400);
  });
});
