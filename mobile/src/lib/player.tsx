import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "./auth";
import { useRoomSession } from "./room-session";
import type { Track } from "./types";

/**
 * Two playback modes share one audio engine:
 *  - room: the room's designated player device plays the shared queue. Everyone else is a remote control.
 *  - solo: a track played just on this phone (Library / Discover).
 * The UI only ever reads `status`, which reflects what the audio engine is really doing.
 * Nothing is shown as "playing" unless a real source loaded.
 */
export type PlayerStatus = "idle" | "loading" | "playing" | "paused" | "error";
interface PlayerState {
  mode: "room" | "solo" | "none";
  status: PlayerStatus;
  error: string | null;
  track: Track | null;
  positionMs: number;
  durationMs: number;
  volume: number;
  playSolo: (t: Track) => Promise<void>;
  stopSolo: () => void;
  toggle: () => void;
  seek: (ms: number) => void;
  setVolume: (v: number) => void;
  next: () => void;
  previous: () => void;
}
const Ctx = createContext<PlayerState | null>(null);
export const usePlayer = () => { const c = useContext(Ctx); if (!c) throw new Error("PlayerProvider missing"); return c; };

const DRIFT_TOLERANCE_MS = 1500;

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const { api, resolveUrl, token } = useAuth();
  const session = useRoomSession();
  const playerRef = useRef<AudioPlayer | null>(null);
  const [status, setStatus] = useState<PlayerStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [soloTrack, setSoloTrack] = useState<Track | null>(null);
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [volume, setVolumeState] = useState(1);
  const loadedItem = useRef<string | null>(null);
  const finishedItem = useRef<string | null>(null);
  const loadToken = useRef(0);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const soloRef = useRef<Track | null>(null);
  soloRef.current = soloTrack;

  const roomActive = session.isPlayerDevice && session.playback?.queueItemId != null;
  const mode: PlayerState["mode"] = soloTrack ? "solo" : session.playback?.queueItemId ? "room" : "none";

  const getPlayer = useCallback(() => {
    if (!playerRef.current) {
      playerRef.current = createAudioPlayer(null, { updateInterval: 250 });
      void setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: "doNotMix" }).catch(() => {});
    }
    return playerRef.current;
  }, []);

  useEffect(() => () => { playerRef.current?.remove(); playerRef.current = null; }, []);

  // Single listener on the engine: progress, errors and track completion.
  useEffect(() => {
    const p = getPlayer();
    const sub = p.addListener("playbackStatusUpdate", (s) => {
      setPositionMs(Math.round(s.currentTime * 1000));
      if (s.duration > 0) setDurationMs(Math.round(s.duration * 1000));
      if (s.isLoaded) setStatus(s.playing ? "playing" : s.isBuffering ? "loading" : "paused");
      if (s.didJustFinish) {
        const solo = soloRef.current;
        if (solo) { setSoloTrack(null); setStatus("idle"); setPositionMs(0); return; }
        const ss = sessionRef.current;
        const id = ss.playback?.queueItemId;
        if (ss.isPlayerDevice && id && finishedItem.current !== id) {
          finishedItem.current = id;
          ss.send("playback:ended", { queueItemId: id }).catch(() => {});
        }
      }
    });
    return () => sub.remove();
  }, [getPlayer]);

  const expectedPosition = useCallback(() => {
    const pb = sessionRef.current.playback;
    if (!pb) return 0;
    const now = Date.now() + sessionRef.current.clockOffsetMs;
    return pb.positionMs + (pb.state === "PLAYING" ? Math.max(0, now - pb.updatedAtMs) : 0);
  }, []);

  // ROOM MODE (player device only): make the audio engine follow the server's authoritative playback state.
  const pb = session.playback;
  useEffect(() => {
    if (soloRef.current) return; // solo playback owns the engine
    const p = getPlayer();
    if (!roomActive || !pb || !pb.queueItemId || !pb.trackId) {
      if (loadedItem.current) { p.pause(); loadedItem.current = null; setStatus("idle"); setPositionMs(0); }
      return;
    }
    const itemId = pb.queueItemId;
    if (loadedItem.current !== itemId) {
      const mine = ++loadToken.current;
      loadedItem.current = itemId;
      finishedItem.current = null;
      setStatus("loading"); setError(null); setDurationMs(pb.durationMs ?? 0);
      (async () => {
        try {
          const r = await api.get<{ availability: any; source: { url: string } | null }>(`/tracks/${pb.trackId}/playback`);
          if (mine !== loadToken.current) return;
          if (!r.source || r.availability.status !== "playable") throw new Error(r.availability.reason ?? "No playable audio source");
          p.replace({ uri: resolveUrl(r.source.url)! , headers: token ? undefined : undefined });
          const pos = expectedPosition();
          if (pos > 500) await p.seekTo(pos / 1000);
          if (sessionRef.current.playback?.state === "PLAYING") p.play();
        } catch (e: any) {
          if (mine !== loadToken.current) return;
          setStatus("error"); setError(e?.message ?? "Could not load this track");
          loadedItem.current = null;
          // Tell the room so it moves on instead of showing a track that is not really playing.
          sessionRef.current.send("playback:error", { queueItemId: itemId, message: e?.message ?? "could not load" }).catch(() => {});
        }
      })();
      return;
    }
    if (pb.state === "PLAYING") {
      const drift = Math.abs(expectedPosition() - Math.round(p.currentTime * 1000));
      if (drift > DRIFT_TOLERANCE_MS) void p.seekTo(expectedPosition() / 1000);
      p.play();
    } else {
      p.pause();
      if (pb.state === "PAUSED") void p.seekTo(pb.positionMs / 1000);
    }
  }, [pb?.queueItemId, pb?.state, pb?.version, pb?.playerUserId, roomActive, api, resolveUrl, token, getPlayer, expectedPosition]); // eslint-disable-line react-hooks/exhaustive-deps

  // Leaving the room (or losing the player role) silences the room audio.
  useEffect(() => {
    if (!session.roomId && !soloRef.current && loadedItem.current) { playerRef.current?.pause(); loadedItem.current = null; setStatus("idle"); setPositionMs(0); }
  }, [session.roomId]);

  const playSolo = useCallback(async (t: Track) => {
    if (sessionRef.current.isPlayerDevice && sessionRef.current.playback?.state === "PLAYING") {
      throw new Error("You're this room's player device. Pause the room first, or leave the room.");
    }
    if (t.availability.status !== "playable") {
      throw new Error("reason" in t.availability ? t.availability.reason : "This track can't be played");
    }
    const p = getPlayer();
    const mine = ++loadToken.current;
    loadedItem.current = null;
    setSoloTrack(t); setStatus("loading"); setError(null); setPositionMs(0); setDurationMs(t.durationMs);
    try {
      const r = await api.get<{ availability: any; source: { url: string } | null }>(`/tracks/${t.id}/playback`);
      if (mine !== loadToken.current) return;
      if (!r.source || r.availability.status !== "playable") throw new Error(r.availability.reason ?? "No playable audio source");
      p.replace({ uri: resolveUrl(r.source.url)! });
      p.play();
      api.post("/library/recent", { trackId: t.id }).catch(() => {});
    } catch (e: any) {
      if (mine !== loadToken.current) return;
      setSoloTrack(null); setStatus("idle");
      throw e;
    }
  }, [api, resolveUrl, getPlayer]);

  const stopSolo = useCallback(() => {
    loadToken.current++;
    playerRef.current?.pause();
    setSoloTrack(null); setStatus("idle"); setPositionMs(0);
  }, []);

  const toggle = useCallback(() => {
    if (soloRef.current) { const p = getPlayer(); p.playing ? p.pause() : p.play(); return; }
    const ss = sessionRef.current;
    ss.send(ss.playback?.state === "PLAYING" ? "playback:pause" : "playback:play").catch((e) => setError(e.message));
  }, [getPlayer]);

  const seek = useCallback((ms: number) => {
    if (soloRef.current) { void getPlayer().seekTo(ms / 1000); return; }
    sessionRef.current.send("playback:seek", { positionMs: Math.round(ms) }).catch((e) => setError(e.message));
  }, [getPlayer]);

  const setVolume = useCallback((v: number) => {
    const c = Math.max(0, Math.min(1, v));
    setVolumeState(c);
    getPlayer().volume = c;
  }, [getPlayer]);

  const next = useCallback(() => { if (soloRef.current) stopSolo(); else sessionRef.current.send("playback:next").catch((e) => setError(e.message)); }, [stopSolo]);
  const previous = useCallback(() => { if (soloRef.current) void getPlayer().seekTo(0); else sessionRef.current.send("playback:previous").catch((e) => setError(e.message)); }, [getPlayer]);

  const value = useMemo<PlayerState>(() => {
    const roomTrack = session.currentItem?.track ?? null;
    const track = soloTrack ?? roomTrack;
    // Non-player devices mirror the shared state; the player device reports what its engine is really doing.
    let st = status;
    let pos = positionMs;
    if (mode === "room" && !session.isPlayerDevice && pb) {
      st = pb.state === "PLAYING" ? "playing" : "paused";
      pos = Math.min(expectedPositionOf(pb, session.clockOffsetMs), pb.durationMs ?? Infinity);
    }
    return { mode, status: mode === "none" ? "idle" : st, error, track, positionMs: pos, durationMs: track?.durationMs ?? durationMs, volume, playSolo, stopSolo, toggle, seek, setVolume, next, previous };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, status, error, soloTrack, session.currentItem, session.isPlayerDevice, pb, positionMs, durationMs, volume, session.clockOffsetMs, playSolo, stopSolo, toggle, seek, setVolume, next, previous]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function expectedPositionOf(pb: { positionMs: number; state: string; updatedAtMs: number }, offset: number) {
  return pb.positionMs + (pb.state === "PLAYING" ? Math.max(0, Date.now() + offset - pb.updatedAtMs) : 0);
}
