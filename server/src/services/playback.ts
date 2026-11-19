import type { PoolClient } from "pg";
import { pool, tx } from "../db.js";
import { badRequest, conflict, forbidden } from "../lib/errors.js";
import { roomActivity, roomChanged } from "../realtime/bus.js";
import type { AuthUser } from "./auth.js";
import { isModerator, lockRoom, requireMember } from "./rooms.js";

/**
 * Shared playback model. The server holds ONE authoritative clock per room:
 * `positionMs` is the position at `updatedAtMs` (DB clock). While PLAYING, clients
 * extrapolate: position = positionMs + (serverNow - updatedAtMs). `serverTimeMs`
 * lets a client estimate its offset from the server clock. Network latency is not
 * compensated, so devices listening locally can drift by roughly the round-trip time.
 */
export interface PlaybackDto {
  state: "PLAYING" | "PAUSED" | "STOPPED";
  positionMs: number; updatedAtMs: number; serverTimeMs: number;
  queueItemId: string | null; trackId: string | null; durationMs: number | null;
  playerUserId: string | null; version: number;
}

const SELECT_PLAYBACK = `
  SELECT ps.state, ps.position_ms, ps.queue_item_id, ps.player_user_id, ps.version,
         floor(extract(epoch from ps.updated_at)*1000)::bigint AS updated_ms,
         floor(extract(epoch from clock_timestamp())*1000)::bigint AS now_ms,
         qi.track_id, t.duration_ms
  FROM playback_sessions ps
  LEFT JOIN queue_items qi ON qi.id=ps.queue_item_id
  LEFT JOIN music_tracks t ON t.id=qi.track_id
  WHERE ps.room_id=$1`;

const toDto = (r: any): PlaybackDto => ({
  state: r.state, positionMs: r.position_ms, updatedAtMs: r.updated_ms, serverTimeMs: r.now_ms,
  queueItemId: r.queue_item_id, trackId: r.track_id, durationMs: r.duration_ms, playerUserId: r.player_user_id, version: r.version,
});

export async function getPlayback(roomId: string, db: { query: PoolClient["query"] } = pool as any): Promise<PlaybackDto> {
  const r = await (db as any).query(SELECT_PLAYBACK, [roomId]);
  return toDto(r.rows[0]);
}

const currentPosition = (p: PlaybackDto) => p.positionMs + (p.state === "PLAYING" ? Math.max(0, p.serverTimeMs - p.updatedAtMs) : 0);

async function startNext(c: PoolClient, roomId: string, voteOrdering: boolean) {
  const next = (await c.query(
    `SELECT qi.id FROM queue_items qi LEFT JOIN queue_votes v ON v.queue_item_id=qi.id
     WHERE qi.room_id=$1 AND qi.status='QUEUED' GROUP BY qi.id
     ORDER BY ${voteOrdering ? "COALESCE(SUM(v.value),0) DESC," : ""} qi.position ASC, qi.added_at ASC LIMIT 1`, [roomId]
  )).rows[0];
  if (!next) {
    await c.query(`UPDATE playback_sessions SET queue_item_id=NULL, state='STOPPED', position_ms=0, updated_at=now(), version=version+1 WHERE room_id=$1`, [roomId]);
    return null;
  }
  await c.query(`UPDATE queue_items SET status='PLAYING' WHERE id=$1`, [next.id]);
  // Everyone currently in the room gets this track in their recently played.
  await c.query(
    `INSERT INTO listening_history (user_id, track_id, room_id)
     SELECT m.user_id, qi.track_id, $2 FROM room_members m, queue_items qi WHERE m.room_id=$2 AND qi.id=$1`, [next.id, roomId]
  );
  await c.query(`UPDATE playback_sessions SET queue_item_id=$2, state='PLAYING', position_ms=0, updated_at=now(), version=version+1 WHERE room_id=$1`, [roomId, next.id]);
  return next.id as string;
}

async function finishCurrent(c: PoolClient, roomId: string, status: "PLAYED" | "REMOVED" = "PLAYED") {
  const ps = (await c.query(`SELECT queue_item_id FROM playback_sessions WHERE room_id=$1`, [roomId])).rows[0];
  if (ps?.queue_item_id) await c.query(`UPDATE queue_items SET status=$2 WHERE id=$1`, [ps.queue_item_id, status]);
}

type Op = (c: PoolClient, room: any, ps: PlaybackDto) => Promise<{ note?: string } | void>;

async function control(user: AuthUser, roomId: string, op: Op, opts: { moderatorOnly?: boolean } = { moderatorOnly: true }) {
  const note = await tx(async (c) => {
    const room = await lockRoom(c, roomId);
    const role = await requireMember(c, roomId, user.id);
    if (opts.moderatorOnly !== false && !isModerator(role)) throw forbidden("NOT_ALLOWED", "Only the host and moderators control playback");
    const ps = await getPlayback(roomId, c as any);
    const res = await op(c, room, ps);
    return res?.note;
  });
  if (note) roomActivity(roomId, note);
  roomChanged(roomId, ["playback", "queue"]);
  return getPlayback(roomId);
}

export const play = (user: AuthUser, roomId: string) => control(user, roomId, async (c, room, ps) => {
  if (ps.state === "PLAYING") return;
  if (ps.queueItemId) {
    await c.query(`UPDATE playback_sessions SET state='PLAYING', updated_at=now(), version=version+1 WHERE room_id=$1`, [roomId]);
  } else if (!(await startNext(c, roomId, room.vote_ordering))) {
    throw conflict("QUEUE_EMPTY", "The queue is empty. Add a track first");
  }
});

export const pause = (user: AuthUser, roomId: string) => control(user, roomId, async (c, _r, ps) => {
  if (ps.state !== "PLAYING") return;
  await c.query(`UPDATE playback_sessions SET state='PAUSED', position_ms=$2, updated_at=now(), version=version+1 WHERE room_id=$1`, [roomId, Math.min(currentPosition(ps), ps.durationMs ?? Infinity)]);
});

export const seek = (user: AuthUser, roomId: string, positionMs: number) => control(user, roomId, async (c, _r, ps) => {
  if (!ps.queueItemId) throw conflict("NOTHING_PLAYING", "Nothing is playing");
  const pos = Math.max(0, Math.min(Math.floor(positionMs), (ps.durationMs ?? positionMs) - 250));
  await c.query(`UPDATE playback_sessions SET position_ms=$2, updated_at=now(), version=version+1 WHERE room_id=$1`, [roomId, pos]);
});

export const next = (user: AuthUser, roomId: string) => control(user, roomId, async (c, room) => {
  await finishCurrent(c, roomId);
  await startNext(c, roomId, room.vote_ordering);
});

/** Skip backward = restart the current track. Previously played tracks are not re-queued. */
export const previous = (user: AuthUser, roomId: string) => control(user, roomId, async (c, _r, ps) => {
  if (!ps.queueItemId) throw conflict("NOTHING_PLAYING", "Nothing is playing");
  await c.query(`UPDATE playback_sessions SET position_ms=0, updated_at=now(), version=version+1 WHERE room_id=$1`, [roomId]);
});

export const setPlayer = (user: AuthUser, roomId: string, playerUserId: string) => control(user, roomId, async (c) => {
  const m = await c.query(`SELECT 1 FROM room_members WHERE room_id=$1 AND user_id=$2`, [roomId, playerUserId]);
  if (!m.rowCount) throw badRequest("NOT_A_MEMBER", "The player device must belong to a room member");
  await c.query(`UPDATE playback_sessions SET player_user_id=$2, version=version+1 WHERE room_id=$1`, [roomId, playerUserId]);
  return { note: "The room's player device changed" };
});

/**
 * Sent by the room's player device when a track finishes. Idempotent: a duplicate or
 * stale report (wrong item id, or already advanced) changes nothing.
 */
export async function ended(user: AuthUser, roomId: string, queueItemId: string) {
  const changed = await tx(async (c) => {
    const room = await lockRoom(c, roomId);
    await requireMember(c, roomId, user.id);
    const ps = await getPlayback(roomId, c as any);
    if (ps.playerUserId !== user.id) throw forbidden("NOT_PLAYER", "Only the room's player device can report track completion");
    if (ps.queueItemId !== queueItemId) return false;
    await finishCurrent(c, roomId);
    await startNext(c, roomId, room.vote_ordering);
    return true;
  });
  if (changed) roomChanged(roomId, ["playback", "queue"]);
  return getPlayback(roomId);
}

/** The player device could not play the current track (provider outage, bad source). Skip it and say why. */
export async function reportPlaybackError(user: AuthUser, roomId: string, queueItemId: string, message: string) {
  const title = await tx(async (c) => {
    const room = await lockRoom(c, roomId);
    await requireMember(c, roomId, user.id);
    const ps = await getPlayback(roomId, c as any);
    if (ps.playerUserId !== user.id || ps.queueItemId !== queueItemId) return null;
    const t = (await c.query(`SELECT t.title FROM queue_items qi JOIN music_tracks t ON t.id=qi.track_id WHERE qi.id=$1`, [queueItemId])).rows[0]?.title as string;
    await finishCurrent(c, roomId, "REMOVED");
    await startNext(c, roomId, room.vote_ordering);
    return t ?? "track";
  });
  if (title) {
    roomActivity(roomId, `Skipped "${title}": ${message.slice(0, 120)}`);
    roomChanged(roomId, ["playback", "queue"]);
  }
  return getPlayback(roomId);
}
