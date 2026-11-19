import { Router } from "express";
import { z } from "zod";
import { notFound } from "../lib/errors.js";
import { parse, requireAuth, wrap } from "../middleware.js";
import { providers } from "../providers/registry.js";
import { getTrackDto, resolvePlayback, searchCatalog } from "../services/catalog.js";

export const tracksRouter = Router();
tracksRouter.use(requireAuth);

tracksRouter.get("/providers", wrap(async (_req, res) => {
  res.json({ providers: [...providers.values()].map((p) => ({ id: p.id, name: p.name, capabilities: p.capabilities })) });
}));

/** Search by title, artist or album. An empty query browses the catalog. */
tracksRouter.get("/search", wrap(async (req, res) => {
  const { q } = parse(z.object({ q: z.string().max(100).default("") }), req.query);
  res.json(await searchCatalog(q));
}));

tracksRouter.get("/:id", wrap(async (req, res) => {
  const t = await getTrackDto(String(req.params.id));
  if (!t) throw notFound("Track");
  res.json({ track: t });
}));

/** Where (and whether) this track can actually be played. Kept separate from metadata on purpose. */
tracksRouter.get("/:id/playback", wrap(async (req, res) => {
  const p = await resolvePlayback(String(req.params.id));
  if (!p) throw notFound("Track");
  res.json(p);
}));
