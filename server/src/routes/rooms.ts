import { Router } from "express";
import QRCode from "qrcode";
import { z } from "zod";
import { pool } from "../db.js";
import { parse, requireAuth, wrap } from "../middleware.js";
import * as rooms from "../services/rooms.js";

export const roomsRouter = Router();
roomsRouter.use(requireAuth);

const create = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(240).optional(),
  visibility: z.enum(["PUBLIC", "PRIVATE"]).default("PUBLIC"),
  password: z.string().min(4).max(100).optional(),
  maxMembers: z.number().int().min(2).max(200).optional(),
  queuePolicy: z.enum(["ANYONE_CAN_ADD", "MODERATORS_ONLY"]).optional(),
  voteOrdering: z.boolean().optional(),
});

roomsRouter.post("/", wrap(async (req, res) => {
  res.status(201).json({ room: await rooms.createRoom(req.user!, parse(create, req.body)) });
}));

roomsRouter.get("/public", wrap(async (_req, res) => { res.json({ rooms: await rooms.listPublicRooms() }); }));
roomsRouter.get("/mine", wrap(async (req, res) => { res.json({ rooms: await rooms.listMyRooms(req.user!.id) }); }));

roomsRouter.post("/join", wrap(async (req, res) => {
  const b = parse(z.object({ code: z.string().trim().min(4).max(12), password: z.string().max(100).optional() }), req.body);
  res.json({ room: await rooms.joinRoom(req.user!, b.code, b.password) });
}));

roomsRouter.get("/:id", wrap(async (req, res) => {
  await rooms.requireMember(pool, String(req.params.id), req.user!.id);
  res.json(await rooms.getRoomSnapshot(String(req.params.id)));
}));

roomsRouter.post("/:id/leave", wrap(async (req, res) => {
  await rooms.leaveRoom(req.user!, String(req.params.id));
  res.json({ ok: true });
}));

/**
 * Invitation payload. The deep link is what the QR code encodes; the in-app scanner reads it.
 * (A plain camera app cannot open a custom scheme inside Expo Go, so the code is always shown too.)
 */
roomsRouter.get("/:id/invite", wrap(async (req, res) => {
  await rooms.requireMember(pool, String(req.params.id), req.user!.id);
  const room = await rooms.getRoom(String(req.params.id));
  const link = `viberoom://join/${room.code}`;
  res.json({ code: room.code, link, hasPassword: room.hasPassword, qrDataUrl: await QRCode.toDataURL(link, { margin: 1, width: 360, color: { dark: "#0B0B12", light: "#FFFFFF" } }) });
}));
