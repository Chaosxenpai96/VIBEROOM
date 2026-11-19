import type { PoolClient } from "pg";
import { pool, tx, type Db } from "../db.js";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors.js";
import { hashPassword, randomRoomCode, verifyPassword } from "../lib/crypto.js";
import { hostChanged, roomActivity, roomChanged } from "../realtime/bus.js";
import { isOnline, onlineCount, onlineUserIds } from "../realtime/presence.js";
import type { AuthUser } from "./auth.js";
import { getQueue } from "./queue.js";
import { getPlayback } from "./playback.js";

export type Role = "HOST" | "MODERATOR" | "MEMBER";

export interface RoomDto {
  id: string; code: string; name: string; description: string | null; visibility: "PUBLIC" | "PRIVATE" | "LOCAL";
  hasPassword: boolean; maxMembers: number; queuePolicy: "ANYONE_CAN_ADD" | "MODERATORS_ONLY"; voteOrdering: boolean;
  hostId: string; createdAt: string;
}

const toRoom = (r: any): RoomDto => ({
  id: r.id, code: r.code, name: r.name, description: r.description, visibility: r.visibility,
  hasPassword: !!r.password_hash, maxMembers: r.max_members, queuePolicy: r.queue_policy, voteOrdering: r.vote_ordering,
  hostId: r.host_id, createdAt: new Date(r.created_at).toISOString(),
});

export interface CreateRoomInput {
  name: string; description?: string; visibility: "PUBLIC" | "PRIVATE"; password?: string;
  maxMembers?: number; queuePolicy?: "ANYONE_CAN_ADD" | "MODERATORS_ONLY"; voteOrdering?: boolean;
}

export async function createRoom(user: AuthUser, input: CreateRoomInput): Promise<RoomDto> {
  const passwordHash = input.password ? await hashPassword(input.password) : null;
  return tx(async (c) => {
    for (let attempt = 0; attempt < 8; attempt++) {
      const code = randomRoomCode();
      const ins = await c.query(
        `INSERT INTO rooms (code, name, description, visibility, password_hash, max_members, queue_policy, vote_ordering, host_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (code) DO NOTHING RETURNING *`,
        [code, input.name.trim(), input.description?.trim() || null, input.visibility, passwordHash, input.maxMembers ?? 20,
         input.queuePolicy ?? "ANYONE_CAN_ADD", input.voteOrdering ?? false, user.id]
      );
      if (!ins.rows[0]) continue;
      const room = ins.rows[0];
      await c.query(`INSERT INTO room_members (room_id, user_id, role) VALUES ($1,$2,'HOST')`, [room.id, user.id]);
      await c.query(`INSERT INTO playback_sessions (room_id, player_user_id) VALUES ($1,$2)`, [room.id, user.id]);
      return toRoom(room);
    }
    throw conflict("CODE_GENERATION_FAILED", "Could not allocate a room code, please try again");
  });
}

/** Locks the room row so membership/queue/playback changes in one room are serialized. */
export async function lockRoom(c: PoolClient, roomId: string) {
  const r = await c.query(`SELECT * FROM rooms WHERE id=$1 AND closed_at IS NULL FOR UPDATE`, [roomId]);
  if (!r.rows[0]) throw notFound("Room");
  return r.rows[0];
}

export async function getMemberRole(db: Db, roomId: string, userId: string): Promise<Role | null> {
  const r = await db.query(`SELECT role FROM room_members WHERE room_id=$1 AND user_id=$2`, [roomId, userId]);
  return r.rows[0]?.role ?? null;
}

export async function requireMember(db: Db, roomId: string, userId: string): Promise<Role> {
  const role = await getMemberRole(db, roomId, userId);
  if (!role) throw forbidden("NOT_A_MEMBER", "You are not a member of this room");
  return role;
}

export const isModerator = (role: Role) => role === "HOST" || role === "MODERATOR";

export async function joinRoom(user: AuthUser, code: string, password?: string): Promise<RoomDto> {
  const found = await pool.query(`SELECT * FROM rooms WHERE code=$1 AND closed_at IS NULL`, [code.trim().toUpperCase()]);
  if (!found.rows[0]) throw notFound("Room");
  const { room, joined } = await tx(async (c) => {
    const room = await lockRoom(c, found.rows[0].id);
    const existing = await getMemberRole(c, room.id, user.id);
    if (existing) return { room, joined: false };
    if (room.password_hash) {
      if (!password || !(await verifyPassword(password, room.password_hash))) throw forbidden("WRONG_PASSWORD", "Incorrect room password");
    }
    const count = (await c.query(`SELECT count(*)::int AS n FROM room_members WHERE room_id=$1`, [room.id])).rows[0].n;
    if (count >= room.max_members) throw conflict("ROOM_FULL", "This room is full");
    await c.query(`INSERT INTO room_members (room_id, user_id, role) VALUES ($1,$2,'MEMBER')`, [room.id, user.id]);
    return { room, joined: true };
  });
  if (joined) {
    roomActivity(room.id, `${user.displayName} joined the room`);
    roomChanged(room.id, ["members"]);
  }
  return toRoom(room);
}

export async function leaveRoom(user: AuthUser, roomId: string) {
  const info = await tx(async (c) => {
    const room = await lockRoom(c, roomId);
    const role = await requireMember(c, roomId, user.id);
    await c.query(`DELETE FROM room_members WHERE room_id=$1 AND user_id=$2`, [roomId, user.id]);
    await c.query(`UPDATE playback_sessions SET player_user_id = NULL WHERE room_id=$1 AND player_user_id=$2`, [roomId, user.id]);
    let newHost: string | null = null;
    let closed = false;
    if (role === "HOST") {
      const next = (await c.query(
        `SELECT user_id FROM room_members WHERE room_id=$1 ORDER BY (role='MODERATOR') DESC, joined_at ASC LIMIT 1`, [roomId]
      )).rows[0];
      if (next) {
        newHost = next.user_id as string;
        await c.query(`UPDATE room_members SET role='HOST' WHERE room_id=$1 AND user_id=$2`, [roomId, newHost]);
        await c.query(`UPDATE rooms SET host_id=$2 WHERE id=$1`, [roomId, newHost]);
        await c.query(`UPDATE playback_sessions SET player_user_id=$2 WHERE room_id=$1`, [roomId, newHost]);
      } else {
        await c.query(`UPDATE rooms SET closed_at=now() WHERE id=$1`, [roomId]);
        closed = true;
      }
    }
    return { room, newHost, closed };
  });
  if (info.closed) return; // nobody left to notify
  roomActivity(roomId, `${user.displayName} left the room`);
  if (info.newHost) hostChanged(roomId, info.newHost);
  roomChanged(roomId, ["members", "room", "playback"]);
}

/** Promote the best online candidate when the host has been gone past the grace period. */
export async function promoteNewHostIfHostGone(roomId: string): Promise<string | null> {
  const promoted = await tx(async (c) => {
    const room = (await c.query(`SELECT * FROM rooms WHERE id=$1 AND closed_at IS NULL FOR UPDATE`, [roomId])).rows[0];
    if (!room || isOnline(roomId, room.host_id)) return null;
    const online = onlineUserIds(roomId);
    if (online.length === 0) return null;
    const cand = (await c.query(
      `SELECT user_id, role FROM room_members WHERE room_id=$1 AND user_id = ANY($2::text[])
       ORDER BY (role='MODERATOR') DESC, joined_at ASC LIMIT 1`, [roomId, online]
    )).rows[0];
    if (!cand) return null;
    await c.query(`UPDATE room_members SET role='MODERATOR' WHERE room_id=$1 AND user_id=$2`, [roomId, room.host_id]);
    await c.query(`UPDATE room_members SET role='HOST' WHERE room_id=$1 AND user_id=$2`, [roomId, cand.user_id]);
    await c.query(`UPDATE rooms SET host_id=$2 WHERE id=$1`, [roomId, cand.user_id]);
    await c.query(`UPDATE playback_sessions SET player_user_id=$2 WHERE room_id=$1 AND (player_user_id IS NULL OR player_user_id=$3)`, [roomId, cand.user_id, room.host_id]);
    return cand.user_id as string;
  });
  if (promoted) {
    hostChanged(roomId, promoted);
    roomActivity(roomId, "The host disconnected, so a new host was assigned");
    roomChanged(roomId, ["members", "room", "playback"]);
  }
  return promoted;
}

export async function updateSettings(user: AuthUser, roomId: string, s: { queuePolicy?: "ANYONE_CAN_ADD" | "MODERATORS_ONLY"; voteOrdering?: boolean; name?: string }) {
  await tx(async (c) => {
    await lockRoom(c, roomId);
    const role = await requireMember(c, roomId, user.id);
    if (role !== "HOST") throw forbidden("HOST_ONLY", "Only the host can change room settings");
    await c.query(
      `UPDATE rooms SET queue_policy=COALESCE($2,queue_policy), vote_ordering=COALESCE($3,vote_ordering), name=COALESCE($4,name) WHERE id=$1`,
      [roomId, s.queuePolicy ?? null, s.voteOrdering ?? null, s.name?.trim() || null]
    );
  });
  roomChanged(roomId, ["room", "queue"]);
}

export async function setMemberRole(actor: AuthUser, roomId: string, targetUserId: string, role: "MODERATOR" | "MEMBER") {
  await tx(async (c) => {
    await lockRoom(c, roomId);
    if ((await requireMember(c, roomId, actor.id)) !== "HOST") throw forbidden("HOST_ONLY", "Only the host can change roles");
    const target = await getMemberRole(c, roomId, targetUserId);
    if (!target) throw notFound("Member");
    if (target === "HOST") throw badRequest("CANNOT_CHANGE_HOST", "The host role cannot be changed this way");
    await c.query(`UPDATE room_members SET role=$3 WHERE room_id=$1 AND user_id=$2`, [roomId, targetUserId, role]);
  });
  roomChanged(roomId, ["members"]);
}

export async function listMembers(roomId: string) {
  const r = await pool.query(
    `SELECT u.id, u.display_name, u.avatar_color, m.role, m.joined_at FROM room_members m JOIN users u ON u.id=m.user_id
     WHERE m.room_id=$1 ORDER BY (m.role='HOST') DESC, (m.role='MODERATOR') DESC, m.joined_at ASC`, [roomId]
  );
  return r.rows.map((m) => ({ userId: m.id, displayName: m.display_name, avatarColor: m.avatar_color, role: m.role as Role, online: isOnline(roomId, m.id) }));
}

export async function getRoom(roomId: string): Promise<RoomDto> {
  const r = await pool.query(`SELECT * FROM rooms WHERE id=$1 AND closed_at IS NULL`, [roomId]);
  if (!r.rows[0]) throw notFound("Room");
  return toRoom(r.rows[0]);
}

export async function getRoomSnapshot(roomId: string) {
  const [room, members, queue, playback] = await Promise.all([getRoom(roomId), listMembers(roomId), getQueue(roomId), getPlayback(roomId)]);
  return { room, members, queue, playback };
}

export async function listPublicRooms() {
  const r = await pool.query(
    `SELECT r.*, u.display_name AS host_name, (SELECT count(*)::int FROM room_members m WHERE m.room_id=r.id) AS member_count
     FROM rooms r JOIN users u ON u.id=r.host_id
     WHERE r.visibility='PUBLIC' AND r.closed_at IS NULL ORDER BY r.created_at DESC LIMIT 50`
  );
  return r.rows.map((x) => ({ ...toRoom(x), hostName: x.host_name, memberCount: x.member_count, onlineCount: onlineCount(x.id) }));
}

export async function listMyRooms(userId: string) {
  const r = await pool.query(
    `SELECT r.*, m.role, (SELECT count(*)::int FROM room_members m2 WHERE m2.room_id=r.id) AS member_count
     FROM room_members m JOIN rooms r ON r.id=m.room_id WHERE m.user_id=$1 AND r.closed_at IS NULL ORDER BY m.joined_at DESC`, [userId]
  );
  return r.rows.map((x) => ({ ...toRoom(x), myRole: x.role as Role, memberCount: x.member_count, onlineCount: onlineCount(x.id) }));
}
