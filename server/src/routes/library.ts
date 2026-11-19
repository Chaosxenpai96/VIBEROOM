import { Router } from "express";
import { z } from "zod";
import { pool, tx } from "../db.js";
import { conflict, notFound } from "../lib/errors.js";
import { parse, requireAuth, wrap } from "../middleware.js";
import { toTrackDto, TRACK_COLUMNS } from "../services/catalog.js";

/** Personal library. Personal playlists are deliberately separate from a room's live queue. */
export const libraryRouter = Router();
libraryRouter.use(requireAuth);

const trackId = z.object({ trackId: z.string().min(1) });

async function trackDtos(rows: any[]) { return Promise.all(rows.map(toTrackDto)); }

libraryRouter.get("/favorites", wrap(async (req, res) => {
  const r = await pool.query(
    `SELECT ${TRACK_COLUMNS} FROM user_favorites f JOIN music_tracks t ON t.id=f.track_id WHERE f.user_id=$1 ORDER BY f.created_at DESC`, [req.user!.id]);
  res.json({ tracks: await trackDtos(r.rows) });
}));

libraryRouter.put("/favorites/:trackId", wrap(async (req, res) => {
  const { trackId: id } = parse(trackId, req.params);
  if (!(await pool.query("SELECT 1 FROM music_tracks WHERE id=$1", [id])).rowCount) throw notFound("Track");
  await pool.query(`INSERT INTO user_favorites (user_id, track_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [req.user!.id, id]);
  res.json({ ok: true });
}));

libraryRouter.delete("/favorites/:trackId", wrap(async (req, res) => {
  await pool.query(`DELETE FROM user_favorites WHERE user_id=$1 AND track_id=$2`, [req.user!.id, String(req.params.trackId)]);
  res.json({ ok: true });
}));

libraryRouter.get("/favorite-ids", wrap(async (req, res) => {
  const r = await pool.query(`SELECT track_id FROM user_favorites WHERE user_id=$1`, [req.user!.id]);
  res.json({ ids: r.rows.map((x) => x.track_id) });
}));

libraryRouter.get("/recent", wrap(async (req, res) => {
  const r = await pool.query(
    `SELECT ${TRACK_COLUMNS} FROM (SELECT DISTINCT ON (track_id) track_id, played_at FROM listening_history WHERE user_id=$1 ORDER BY track_id, played_at DESC) h
     JOIN music_tracks t ON t.id=h.track_id ORDER BY h.played_at DESC LIMIT 20`, [req.user!.id]);
  res.json({ tracks: await trackDtos(r.rows) });
}));

/** Records a solo play on this device. Room plays are recorded server-side when a track starts. */
libraryRouter.post("/recent", wrap(async (req, res) => {
  const { trackId: id } = parse(trackId, req.body);
  if (!(await pool.query("SELECT 1 FROM music_tracks WHERE id=$1", [id])).rowCount) throw notFound("Track");
  await pool.query(`INSERT INTO listening_history (user_id, track_id) VALUES ($1,$2)`, [req.user!.id, id]);
  res.json({ ok: true });
}));

libraryRouter.get("/playlists", wrap(async (req, res) => {
  const r = await pool.query(
    `SELECT p.id, p.name, p.created_at, (SELECT count(*)::int FROM playlist_tracks pt WHERE pt.playlist_id=p.id) AS track_count
     FROM playlists p WHERE p.user_id=$1 ORDER BY p.created_at DESC`, [req.user!.id]);
  res.json({ playlists: r.rows.map((p) => ({ id: p.id, name: p.name, trackCount: p.track_count })) });
}));

libraryRouter.post("/playlists", wrap(async (req, res) => {
  const { name } = parse(z.object({ name: z.string().trim().min(1).max(60) }), req.body);
  const r = await pool.query(`INSERT INTO playlists (user_id, name) VALUES ($1,$2) RETURNING id, name`, [req.user!.id, name]);
  res.status(201).json({ playlist: { ...r.rows[0], trackCount: 0 } });
}));

async function ownedPlaylist(userId: string, id: string) {
  const r = await pool.query(`SELECT id, name FROM playlists WHERE id=$1 AND user_id=$2`, [id, userId]);
  if (!r.rows[0]) throw notFound("Playlist");
  return r.rows[0] as { id: string; name: string };
}

libraryRouter.get("/playlists/:id", wrap(async (req, res) => {
  const p = await ownedPlaylist(req.user!.id, String(req.params.id));
  const r = await pool.query(`SELECT ${TRACK_COLUMNS} FROM playlist_tracks pt JOIN music_tracks t ON t.id=pt.track_id WHERE pt.playlist_id=$1 ORDER BY pt.position`, [p.id]);
  res.json({ playlist: p, tracks: await trackDtos(r.rows) });
}));

libraryRouter.delete("/playlists/:id", wrap(async (req, res) => {
  await ownedPlaylist(req.user!.id, String(req.params.id));
  await pool.query(`DELETE FROM playlists WHERE id=$1`, [String(req.params.id)]);
  res.json({ ok: true });
}));

libraryRouter.post("/playlists/:id/tracks", wrap(async (req, res) => {
  const { trackId: id } = parse(trackId, req.body);
  const p = await ownedPlaylist(req.user!.id, String(req.params.id));
  if (!(await pool.query("SELECT 1 FROM music_tracks WHERE id=$1", [id])).rowCount) throw notFound("Track");
  await tx(async (c) => {
    await c.query(`SELECT id FROM playlists WHERE id=$1 FOR UPDATE`, [p.id]);
    const dup = await c.query(`SELECT 1 FROM playlist_tracks WHERE playlist_id=$1 AND track_id=$2`, [p.id, id]);
    if (dup.rowCount) throw conflict("DUPLICATE_TRACK", "That track is already in this playlist");
    await c.query(`INSERT INTO playlist_tracks (playlist_id, track_id, position) SELECT $1,$2,COALESCE(MAX(position),-1)+1 FROM playlist_tracks WHERE playlist_id=$1`, [p.id, id]);
  });
  res.json({ ok: true });
}));

libraryRouter.delete("/playlists/:id/tracks/:trackId", wrap(async (req, res) => {
  const p = await ownedPlaylist(req.user!.id, String(req.params.id));
  await pool.query(`DELETE FROM playlist_tracks WHERE playlist_id=$1 AND track_id=$2`, [p.id, String(req.params.trackId)]);
  res.json({ ok: true });
}));
