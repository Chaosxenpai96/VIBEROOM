import type http from "node:http";
import { Server, type Socket } from "socket.io";
import { z, type ZodTypeAny } from "zod";
import { config } from "../config.js";
import { pool } from "../db.js";
import { AppError, unauthorized } from "../lib/errors.js";
import { parse } from "../middleware.js";
import { userFromToken, type AuthUser } from "../services/auth.js";
import * as playback from "../services/playback.js";
import * as queue from "../services/queue.js";
import * as rooms from "../services/rooms.js";
import { bus, type Part } from "./bus.js";
import { addPresence, isOnline, removePresence } from "./presence.js";

interface Activity { id: string; text: string; at: number }
const roomId = z.object({ roomId: z.string().min(1) });

export function attachRealtime(server: http.Server) {
  const io = new Server(server, {
    cors: { origin: config.corsOrigin },
    pingInterval: 10_000,
    pingTimeout: 10_000,
  });

  const activity = new Map<string, Activity[]>();
  const hostTimers = new Map<string, NodeJS.Timeout>();
  const chains = new Map<string, Promise<unknown>>();
  let activitySeq = 0;

  const room = (id: string) => `room:${id}`;

  // ---- outbound: always send fresh authoritative state, serialized per room so clients never see updates out of order
  const onChanged = (id: string, parts: Part[]) => {
    const prev = chains.get(id) ?? Promise.resolve();
    const next = prev.then(async () => {
      const unique = [...new Set(parts)];
      const jobs: Promise<void>[] = [];
      if (unique.includes("room")) jobs.push(rooms.getRoom(id).then((r) => void io.to(room(id)).emit("room:room", { room: r })));
      if (unique.includes("members")) jobs.push(rooms.listMembers(id).then((members) => void io.to(room(id)).emit("room:members", { members })));
      if (unique.includes("queue")) jobs.push(queue.getQueue(id).then((q) => void io.to(room(id)).emit("room:queue", { queue: q })));
      if (unique.includes("playback")) jobs.push(playback.getPlayback(id).then((p) => void io.to(room(id)).emit("room:playback", { playback: p })));
      await Promise.all(jobs);
    }).catch((e) => console.error("broadcast failed", e));
    chains.set(id, next);
  };
  const onActivity = (id: string, text: string) => {
    const entry: Activity = { id: `${Date.now()}-${++activitySeq}`, text, at: Date.now() };
    const list = activity.get(id) ?? [];
    list.push(entry);
    if (list.length > 50) list.shift();
    activity.set(id, list);
    io.to(room(id)).emit("room:activity", { entry });
  };
  const onHost = (id: string, hostId: string) => io.to(room(id)).emit("room:host", { hostId });
  bus.on("changed", onChanged);
  bus.on("activity", onActivity);
  bus.on("host", onHost);

  // ---- host disconnect handling
  const scheduleHostCheck = (id: string) => {
    if (hostTimers.has(id)) return;
    hostTimers.set(id, setTimeout(async () => {
      hostTimers.delete(id);
      try { await rooms.promoteNewHostIfHostGone(id); } catch (e) { console.error("host promotion failed", e); }
    }, config.hostGraceMs));
  };
  const cancelHostCheck = (id: string) => {
    const t = hostTimers.get(id);
    if (t) { clearTimeout(t); hostTimers.delete(id); }
  };

  // ---- auth
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      const user = typeof token === "string" ? await userFromToken(token) : null;
      if (!user) throw unauthorized();
      socket.data.user = user;
      socket.data.subscribed = new Set<string>();
      next();
    } catch {
      next(new Error("UNAUTHORIZED"));
    }
  });

  io.on("connection", (socket: Socket) => {
    const user: AuthUser = socket.data.user;
    const subscribed: Set<string> = socket.data.subscribed;
    let tokens = 40, last = Date.now();

    const on = <S extends ZodTypeAny>(event: string, schema: S, fn: (data: z.infer<S>) => Promise<unknown>) => {
      socket.on(event, async (payload: unknown, ack?: (r: unknown) => void) => {
        const cb = typeof ack === "function" ? ack : () => {};
        // simple per-socket token bucket: 40 burst, refills 10/s
        const now = Date.now();
        tokens = Math.min(40, tokens + ((now - last) / 1000) * 10); last = now;
        if (tokens < 1) return cb({ ok: false, error: { code: "RATE_LIMITED", message: "You are doing that too fast" } });
        tokens -= 1;
        try {
          const data = parse(schema, payload ?? {});
          cb({ ok: true, data: (await fn(data)) ?? null });
        } catch (e) {
          if (e instanceof AppError) cb({ ok: false, error: { code: e.code, message: e.message } });
          else { console.error(`socket ${event} failed`, e); cb({ ok: false, error: { code: "INTERNAL", message: "Something went wrong" } }); }
        }
      });
    };

    on("room:subscribe", roomId, async ({ roomId: id }) => {
      await rooms.requireMember(pool, id, user.id);
      const snapshot = await rooms.getRoomSnapshot(id);
      await socket.join(room(id));
      subscribed.add(id);
      const first = addPresence(id, user.id, socket.id);
      if (user.id === snapshot.room.hostId) cancelHostCheck(id);
      else if (!isOnline(id, snapshot.room.hostId)) scheduleHostCheck(id);
      if (first) { onActivity(id, `${user.displayName} is online`); onChanged(id, ["members"]); }
      // members must reflect the presence we just added
      return { ...snapshot, members: await rooms.listMembers(id), activity: activity.get(id) ?? [] };
    });

    const leaveRoomSocket = async (id: string) => {
      if (!subscribed.delete(id)) return;
      await socket.leave(room(id));
      if (removePresence(id, user.id, socket.id)) {
        onChanged(id, ["members"]);
        try {
          const r = (await pool.query(`SELECT host_id FROM rooms WHERE id=$1 AND closed_at IS NULL`, [id])).rows[0];
          if (r?.host_id === user.id) scheduleHostCheck(id);
        } catch (e) { console.error(e); }
      }
    };
    on("room:unsubscribe", roomId, async ({ roomId: id }) => { await leaveRoomSocket(id); });
    socket.on("disconnect", () => { for (const id of [...subscribed]) void leaveRoomSocket(id); });

    on("queue:add", roomId.extend({ trackId: z.string().min(1) }), async (d) => ({ itemId: await queue.addTrack(user, d.roomId, d.trackId) }));
    on("queue:remove", roomId.extend({ itemId: z.string().min(1) }), (d) => queue.removeItem(user, d.roomId, d.itemId));
    on("queue:reorder", roomId.extend({ itemId: z.string().min(1), toIndex: z.number().int().min(0).max(500) }), (d) => queue.reorderItem(user, d.roomId, d.itemId, d.toIndex));
    on("queue:vote", roomId.extend({ itemId: z.string().min(1), value: z.union([z.literal(1), z.literal(-1)]) }), (d) => queue.voteItem(user, d.roomId, d.itemId, d.value));

    on("playback:play", roomId, async (d) => ({ playback: await playback.play(user, d.roomId) }));
    on("playback:pause", roomId, async (d) => ({ playback: await playback.pause(user, d.roomId) }));
    on("playback:seek", roomId.extend({ positionMs: z.number().min(0).max(86_400_000) }), async (d) => ({ playback: await playback.seek(user, d.roomId, d.positionMs) }));
    on("playback:next", roomId, async (d) => ({ playback: await playback.next(user, d.roomId) }));
    on("playback:previous", roomId, async (d) => ({ playback: await playback.previous(user, d.roomId) }));
    on("playback:ended", roomId.extend({ queueItemId: z.string().min(1) }), async (d) => ({ playback: await playback.ended(user, d.roomId, d.queueItemId) }));
    on("playback:error", roomId.extend({ queueItemId: z.string().min(1), message: z.string().max(300) }), async (d) => ({ playback: await playback.reportPlaybackError(user, d.roomId, d.queueItemId, d.message) }));
    on("playback:getState", roomId, async (d) => {
      await rooms.requireMember(pool, d.roomId, user.id);
      return { playback: await playback.getPlayback(d.roomId) };
    });
    on("room:setPlayer", roomId.extend({ userId: z.string().min(1) }), async (d) => ({ playback: await playback.setPlayer(user, d.roomId, d.userId) }));
    on("room:updateSettings", roomId.extend({
      queuePolicy: z.enum(["ANYONE_CAN_ADD", "MODERATORS_ONLY"]).optional(), voteOrdering: z.boolean().optional(), name: z.string().min(1).max(60).optional(),
    }), (d) => rooms.updateSettings(user, d.roomId, d));
    on("room:setRole", roomId.extend({ userId: z.string().min(1), role: z.enum(["MODERATOR", "MEMBER"]) }), (d) => rooms.setMemberRole(user, d.roomId, d.userId, d.role));
  });

  return {
    io,
    close: async () => {
      bus.off("changed", onChanged); bus.off("activity", onActivity); bus.off("host", onHost);
      for (const t of hostTimers.values()) clearTimeout(t);
      hostTimers.clear();
      await io.close();
    },
  };
}
