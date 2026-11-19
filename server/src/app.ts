import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { config } from "./config.js";
import { apiLimiter, errorHandler } from "./middleware.js";
import { authRouter } from "./routes/auth.js";
import { libraryRouter } from "./routes/library.js";
import { roomsRouter } from "./routes/rooms.js";
import { tracksRouter } from "./routes/tracks.js";

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.use(cors({ origin: config.corsOrigin === "*" ? true : config.corsOrigin.split(",") }));
  app.use(express.json({ limit: "100kb" }));

  // Demo audio + cover art. Express static supports HTTP Range, which audio seeking needs.
  app.use("/audio", express.static(path.join(publicDir, "audio"), { maxAge: "1h" }));
  app.use("/art", express.static(path.join(publicDir, "art"), { maxAge: "1h" }));

  app.get("/health", (_req, res) => { res.json({ ok: true }); });
  app.use("/api", apiLimiter);
  app.use("/api/auth", authRouter);
  app.use("/api/tracks", tracksRouter);
  app.use("/api/rooms", roomsRouter);
  app.use("/api/library", libraryRouter);
  app.use((_req, res) => { res.status(404).json({ error: { code: "NOT_FOUND", message: "Not found" } }); });
  app.use(errorHandler);
  return app;
}
