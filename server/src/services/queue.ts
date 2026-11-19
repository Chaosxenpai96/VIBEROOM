import { pool, tx } from "../db.js";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors.js";
import { config } from "../config.js";
import { roomActivity, roomChanged } from "../realtime/bus.js";
import type { AuthUser } from "./auth.js";
import { availabilityFor, toTrackDto, TRACK_COLUMNS, type TrackDto } from "./catalog.js";
import { isModerator, lockRoom, requireMember } from "./rooms.js";

export interface QueueItemDto {
  id: string; status: "QUEUED" | "PLAYING"; position: number; addedAt: string;
  addedBy: { id: string; displayName: string; avatarColor: string };
  track: TrackDto; score: number; upvoterIds: string[]; downvoterIds: string[];
}

/** Authoritative queue: the PLAYING item first, then upcoming items (by votes when the room uses vote ordering). */
export async function getQueue(roomId: string): Promise<QueueItemDto[]> {
  const room = (await pool.query(`SELECT vote_ordering FROM rooms WHERE id=$1`, [roomId])).rows[0];
  const r = await pool.query(
    `SELECT qi.id, qi.status, qi.position, qi.added_at, u.id AS user_id, u.display_name, u.avatar_color, ${TRACK_COLUMNS},
       COALESCE(SUM(v.value),0)::int AS score,
       COALESCE(array_agg(v.user_id) FILTER (WHERE v.value=1), '{}') AS up,
       COALESCE(array_agg(v.user_id) FILTER (WHERE v.value=-1), '{}') AS down
     FROM queue_items qi
     JOIN users u ON u.id=qi.added_by_id
     JOIN music_tracks t ON t.id=qi.track_id
     LEFT JOIN queue_votes v ON v.queue_item_id=qi.id
     WHERE qi.room_id=$1 AND qi.status IN ('QUEUED','PLAYING')
     GROUP BY qi.id, u.id, t.id`, [roomId]
  );
  const items: QueueItemDto[] = await Promise.all(r.rows.map(async (x) => ({
    id: x.id, status: x.status, position: x.position, addedAt: new Date(x.added_at).toISOString(),
    addedBy: { id: x.user_id, displayName: x.display_name, avatarColor: x.avatar_color },
    track: await toTrackDto(x), score: x.score, upvoterIds: x.up, downvoterIds: x.down,
  })));
  const byVotes = !!room?.vote_ordering;
  return items.sort((a, b) => {
    if (a.status !== b.status) return a.status === "PLAYING" ? -1 : 1;
    if (byVotes && a.score !== b.score) return b.score - a.score;
    return a.position - b.position;
  });
}

export async function addTrack(user: AuthUser, roomId: string, trackId: string) {
  const row = (await pool.query(`SELECT ${TRACK_COLUMNS} FROM music_tracks t WHERE t.id=$1`, [trackId])).rows[0];
  if (!row) throw notFound("Track");
  // Provider call happens before taking the room lock so a slow provider cannot block other members.
  const availability = await availabilityFor(row.provider_id, row.provider_track_id);
  if (availability.status !== "playable") {
    throw conflict("TRACK_UNPLAYABLE", "reason" in availability ? availability.reason : "This track cannot be played");
  }
  const itemId = await tx(async (c) => {
    const room = await lockRoom(c, roomId);
    const role = await requireMember(c, roomId, user.id);
    if (room.queue_policy === "MODERATORS_ONLY" && !isModerator(role)) throw forbidden("QUEUE_LOCKED", "Only the host and moderators can add tracks in this room");
    const dup = await c.query(`SELECT 1 FROM queue_items WHERE room_id=$1 AND track_id=$2 AND status IN ('QUEUED','PLAYING')`, [roomId, trackId]);
    if (dup.rowCount) throw conflict("DUPLICATE_TRACK", "This track is already in the queue");
    const mine = (await c.query(`SELECT count(*)::int AS n FROM queue_items WHERE room_id=$1 AND added_by_id=$2 AND status='QUEUED'`, [roomId, user.id])).rows[0].n;
    if (mine >= config.maxQueuedPerUser && !isModerator(role)) throw conflict("QUEUE_LIMIT", `You can have at most ${config.maxQueuedPerUser} tracks waiting in the queue`);
    const pos = (await c.query(`SELECT COALESCE(MAX(position), -1)+1 AS p FROM queue_items WHERE room_id=$1`, [roomId])).rows[0].p;
    const ins = await c.query(`INSERT INTO queue_items (room_id, track_id, added_by_id, position) VALUES ($1,$2,$3,$4) RETURNING id`, [roomId, trackId, user.id, pos]);
    return ins.rows[0].id as string;
  });
  roomActivity(roomId, `${user.displayName} added "${row.title}"`);
  roomChanged(roomId, ["queue"]);
  return itemId;
}

export async function removeItem(user: AuthUser, roomId: string, itemId: string) {
  const title = await tx(async (c) => {
    await lockRoom(c, roomId);
    const role = await requireMember(c, roomId, user.id);
    const it = (await c.query(
      `SELECT qi.*, t.title FROM queue_items qi JOIN music_tracks t ON t.id=qi.track_id WHERE qi.id=$1 AND qi.room_id=$2 AND qi.status IN ('QUEUED','PLAYING')`, [itemId, roomId]
    )).rows[0];
    if (!it) throw notFound("Queue item");
    if (it.status === "PLAYING") throw badRequest("CURRENTLY_PLAYING", "Skip the current track instead of removing it");
    if (it.added_by_id !== user.id && !isModerator(role)) throw forbidden("NOT_ALLOWED", "You can only remove tracks you added");
    await c.query(`UPDATE queue_items SET status='REMOVED' WHERE id=$1`, [itemId]);
    return it.title as string;
  });
  roomActivity(roomId, `${user.displayName} removed "${title}"`);
  roomChanged(roomId, ["queue"]);
}

export async function reorderItem(user: AuthUser, roomId: string, itemId: string, toIndex: number) {
  await tx(async (c) => {
    const room = await lockRoom(c, roomId);
    const role = await requireMember(c, roomId, user.id);
    if (!isModerator(role)) throw forbidden("NOT_ALLOWED", "Only the host and moderators can reorder the queue");
    if (room.vote_ordering) throw badRequest("VOTE_ORDERING_ON", "Manual ordering is disabled while vote ordering is on");
    const queued = (await c.query(`SELECT id FROM queue_items WHERE room_id=$1 AND status='QUEUED' ORDER BY position ASC, added_at ASC`, [roomId])).rows.map((x) => x.id as string);
    const from = queued.indexOf(itemId);
    if (from < 0) throw notFound("Queue item");
    queued.splice(from, 1);
    queued.splice(Math.max(0, Math.min(toIndex, queued.length)), 0, itemId);
    await c.query(
      `UPDATE queue_items q SET position = x.pos FROM (SELECT unnest($1::text[]) AS id, generate_series(0, $2::int) AS pos) x WHERE q.id = x.id`,
      [queued, queued.length - 1]
    );
  });
  roomChanged(roomId, ["queue"]);
}

/** Voting the same way twice clears the vote; voting the other way switches it. One row per user per item is enforced by a unique key. */
export async function voteItem(user: AuthUser, roomId: string, itemId: string, value: 1 | -1) {
  await tx(async (c) => {
    await lockRoom(c, roomId);
    await requireMember(c, roomId, user.id);
    const it = (await c.query(`SELECT 1 FROM queue_items WHERE id=$1 AND room_id=$2 AND status='QUEUED'`, [itemId, roomId])).rows[0];
    if (!it) throw notFound("Queued track");
    const cur = (await c.query(`SELECT value FROM queue_votes WHERE queue_item_id=$1 AND user_id=$2`, [itemId, user.id])).rows[0];
    if (cur?.value === value) await c.query(`DELETE FROM queue_votes WHERE queue_item_id=$1 AND user_id=$2`, [itemId, user.id]);
    else await c.query(
      `INSERT INTO queue_votes (queue_item_id, user_id, value) VALUES ($1,$2,$3) ON CONFLICT (queue_item_id, user_id) DO UPDATE SET value=EXCLUDED.value`,
      [itemId, user.id, value]
    );
  });
  roomChanged(roomId, ["queue"]);
}
