import { pool, type Db } from "../db.js";
import { getProvider, providers } from "../providers/registry.js";
import type { PlaybackAvailability, ProviderTrack } from "../providers/types.js";

export interface TrackRow {
  id: string; provider_id: string; provider_track_id: string; title: string; artist: string;
  album: string | null; duration_ms: number; artwork_url: string | null; genre: string | null;
  audio_path: string | null; is_karaoke: boolean;
}

export interface TrackDto {
  id: string; providerId: string; providerTrackId: string; title: string; artist: string;
  album: string | null; durationMs: number; artworkUrl: string | null; genre: string | null;
  isKaraoke: boolean; availability: PlaybackAvailability;
}

export const TRACK_COLUMNS = `t.id AS track_id, t.provider_id, t.provider_track_id, t.title, t.artist, t.album, t.duration_ms, t.artwork_url, t.genre, t.is_karaoke, t.audio_path`;

export async function availabilityFor(providerId: string, providerTrackId: string): Promise<PlaybackAvailability> {
  const provider = getProvider(providerId);
  if (!provider) return { status: "unavailable", reason: "This music provider is not configured on the server" };
  try {
    return await provider.getPlaybackAvailability(providerTrackId);
  } catch {
    return { status: "unavailable", reason: "Provider could not be reached" };
  }
}

export async function toTrackDto(r: { track_id: string; provider_id: string; provider_track_id: string; title: string; artist: string; album: string | null; duration_ms: number; artwork_url: string | null; genre: string | null; is_karaoke: boolean }): Promise<TrackDto> {
  return {
    id: r.track_id, providerId: r.provider_id, providerTrackId: r.provider_track_id, title: r.title, artist: r.artist,
    album: r.album, durationMs: r.duration_ms, artworkUrl: r.artwork_url, genre: r.genre, isKaraoke: r.is_karaoke,
    availability: await availabilityFor(r.provider_id, r.provider_track_id),
  };
}

export async function upsertTrack(t: ProviderTrack, db: Db = pool): Promise<string> {
  const r = await db.query(
    `INSERT INTO music_tracks (provider_id, provider_track_id, title, artist, album, duration_ms, artwork_url, genre, audio_path, is_karaoke)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (provider_id, provider_track_id) DO UPDATE SET
       title=EXCLUDED.title, artist=EXCLUDED.artist, album=EXCLUDED.album, duration_ms=EXCLUDED.duration_ms,
       artwork_url=EXCLUDED.artwork_url, genre=EXCLUDED.genre, audio_path=EXCLUDED.audio_path, is_karaoke=EXCLUDED.is_karaoke
     RETURNING id`,
    [t.providerId, t.providerTrackId, t.title, t.artist, t.album ?? null, t.durationMs, t.artworkUrl ?? null, t.genre ?? null, t.audioPath ?? null, t.isKaraoke ?? false]
  );
  return r.rows[0].id;
}

export async function ensureProviderRows() {
  for (const p of providers.values()) {
    await pool.query(
      `INSERT INTO music_providers (id, name, can_stream, enabled) VALUES ($1,$2,$3,true)
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, can_stream=EXCLUDED.can_stream`,
      [p.id, p.name, p.capabilities.canStreamDirectly]
    );
  }
}

/** Searches every configured provider; a failing provider is reported instead of failing the whole search. */
export async function searchCatalog(query: string) {
  const tracks: TrackDto[] = [];
  const providerErrors: { providerId: string; message: string }[] = [];
  for (const provider of providers.values()) {
    try {
      const found = await provider.searchTracks(query);
      for (const t of found.slice(0, 50)) {
        const id = await upsertTrack(t);
        const row = (await pool.query(`SELECT ${TRACK_COLUMNS} FROM music_tracks t WHERE t.id=$1`, [id])).rows[0];
        tracks.push(await toTrackDto(row));
      }
    } catch {
      providerErrors.push({ providerId: provider.id, message: `${provider.name} is unavailable right now` });
    }
  }
  return { tracks, providerErrors };
}

export async function getTrackDto(id: string, db: Db = pool): Promise<TrackDto | null> {
  const r = await db.query(`SELECT ${TRACK_COLUMNS} FROM music_tracks t WHERE t.id=$1`, [id]);
  return r.rows[0] ? toTrackDto(r.rows[0]) : null;
}

/** Resolve how a stored track can actually be played right now. */
export async function resolvePlayback(trackId: string) {
  const row = (await pool.query(`SELECT provider_id, provider_track_id FROM music_tracks WHERE id=$1`, [trackId])).rows[0];
  if (!row) return null;
  const availability = await availabilityFor(row.provider_id, row.provider_track_id);
  let source = null;
  if (availability.status === "playable") {
    try { source = await getProvider(row.provider_id)!.getPlaybackSource(row.provider_track_id); } catch { source = null; }
  }
  const playable = availability.status === "playable" && source !== null;
  return { trackId, availability: playable ? availability : availability.status === "playable" ? { status: "unavailable" as const, reason: "No playable audio source is available" } : availability, source: playable ? source : null };
}
