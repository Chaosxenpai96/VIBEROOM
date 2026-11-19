import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { useAuth } from "./auth";
import type { ActivityEntry, Member, Playback, QueueItem, Room } from "./types";

type Ack<T = any> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };
export type Conn = "idle" | "connecting" | "online" | "reconnecting";

interface SessionState {
  conn: Conn;
  roomId: string | null;
  room: Room | null;
  members: Member[];
  queue: QueueItem[];
  playback: Playback | null;
  activity: ActivityEntry[];
  /** server clock minus device clock, in ms, measured when the last playback state arrived */
  clockOffsetMs: number;
  loadError: string | null;
  enterRoom: (roomId: string) => Promise<void>;
  exitRoom: () => void;
  /** emits an event; rejects with the server's message when it refuses */
  send: <T = any>(event: string, payload?: Record<string, unknown>) => Promise<T>;
  me: { id: string } | null;
  myRole: Member["role"] | null;
  isPlayerDevice: boolean;
  currentItem: QueueItem | null;
}
const Ctx = createContext<SessionState | null>(null);
export const useRoomSession = () => { const c = useContext(Ctx); if (!c) throw new Error("RoomSessionProvider missing"); return c; };

export function RoomSessionProvider({ children }: { children: React.ReactNode }) {
  const { token, user, serverUrl } = useAuth();
  const [conn, setConn] = useState<Conn>("idle");
  const [roomId, setRoomId] = useState<string | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [playback, setPlayback] = useState<Playback | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [clockOffsetMs, setOffset] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const roomRef = useRef<string | null>(null);
  roomRef.current = roomId;

  const applyPlayback = useCallback((p: Playback) => {
    setOffset(p.serverTimeMs - Date.now());
    setPlayback((cur) => (cur && cur.version > p.version ? cur : p)); // never apply an older state over a newer one
  }, []);

  const subscribe = useCallback(async (id: string) => {
    const s = socketRef.current;
    if (!s) return;
    const r: Ack = await new Promise((res) => s.emit("room:subscribe", { roomId: id }, res));
    if (!r.ok) { setLoadError(r.error.message); return; }
    setLoadError(null);
    const d = r.data;
    setRoom(d.room); setMembers(d.members); setQueue(d.queue); setActivity(d.activity ?? []);
    setOffset(d.playback.serverTimeMs - Date.now()); setPlayback(d.playback);
  }, []);

  // One socket per signed-in session. It re-subscribes to the active room after any reconnect
  // and takes a fresh authoritative snapshot, so missed events can never leave the UI stale.
  useEffect(() => {
    if (!token) return;
    setConn("connecting");
    const s = io(serverUrl, { auth: { token }, transports: ["websocket"], reconnectionDelay: 500, reconnectionDelayMax: 4000 });
    socketRef.current = s;
    s.on("connect", () => { setConn("online"); if (roomRef.current) void subscribe(roomRef.current); });
    s.on("disconnect", () => setConn("reconnecting"));
    s.on("connect_error", () => setConn("reconnecting"));
    s.on("room:room", (d) => setRoom(d.room));
    s.on("room:members", (d) => setMembers(d.members));
    s.on("room:queue", (d) => setQueue(d.queue));
    s.on("room:playback", (d) => applyPlayback(d.playback));
    s.on("room:activity", (d) => setActivity((a) => [...a.slice(-49), d.entry]));
    return () => { s.removeAllListeners(); s.close(); socketRef.current = null; setConn("idle"); };
  }, [token, serverUrl, subscribe, applyPlayback]);

  const enterRoom = useCallback(async (id: string) => {
    if (roomRef.current && roomRef.current !== id) socketRef.current?.emit("room:unsubscribe", { roomId: roomRef.current });
    roomRef.current = id;
    setRoomId(id); setRoom(null); setMembers([]); setQueue([]); setPlayback(null); setActivity([]); setLoadError(null);
    await subscribe(id);
  }, [subscribe]);

  const exitRoom = useCallback(() => {
    if (roomRef.current) socketRef.current?.emit("room:unsubscribe", { roomId: roomRef.current });
    roomRef.current = null;
    setRoomId(null); setRoom(null); setMembers([]); setQueue([]); setPlayback(null); setActivity([]);
  }, []);

  const send = useCallback(<T,>(event: string, payload: Record<string, unknown> = {}) => new Promise<T>((resolve, reject) => {
    const s = socketRef.current;
    if (!s || !s.connected) return reject(new Error("Not connected. Reconnecting…"));
    s.timeout(8000).emit(event, { roomId: roomRef.current, ...payload }, (err: Error | null, r: Ack<T>) => {
      if (err) return reject(new Error("The server took too long to respond"));
      r.ok ? resolve(r.data) : reject(new Error(r.error.message));
    });
  }), []);

  const myRole = useMemo(() => members.find((m) => m.userId === user?.id)?.role ?? null, [members, user]);
  const currentItem = useMemo(() => queue.find((q) => q.status === "PLAYING") ?? null, [queue]);
  const value: SessionState = {
    conn, roomId, room, members, queue, playback, activity, clockOffsetMs, loadError, enterRoom, exitRoom, send,
    me: user ? { id: user.id } : null, myRole,
    isPlayerDevice: !!user && playback?.playerUserId === user.id, currentItem,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
