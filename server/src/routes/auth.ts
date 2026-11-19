import { Router } from "express";
import { z } from "zod";
import { config } from "../config.js";
import { authLimiter, parse, requireAuth, wrap } from "../middleware.js";
import * as auth from "../services/auth.js";

const password = z.string().min(8, "must be at least 8 characters").max(200);
export const authRouter = Router();

authRouter.post("/register", authLimiter, wrap(async (req, res) => {
  const b = parse(z.object({ email: z.string().email().max(200), password, displayName: z.string().trim().min(1).max(40) }), req.body);
  res.status(201).json(await auth.register(b.email, b.password, b.displayName));
}));

authRouter.post("/login", authLimiter, wrap(async (req, res) => {
  const b = parse(z.object({ email: z.string().email(), password: z.string().min(1).max(200) }), req.body);
  res.json(await auth.login(b.email, b.password));
}));

authRouter.post("/logout", requireAuth, wrap(async (req, res) => {
  await auth.logout(req.token!);
  res.json({ ok: true });
}));

authRouter.get("/me", requireAuth, wrap(async (req, res) => { res.json({ user: req.user }); }));

authRouter.patch("/me", requireAuth, wrap(async (req, res) => {
  const b = parse(z.object({
    displayName: z.string().trim().min(1).max(40).optional(),
    bio: z.string().trim().max(160).optional(),
    avatarColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  }), req.body);
  res.json({ user: await auth.updateProfile(req.user!.id, b) });
}));

authRouter.post("/password-reset/request", authLimiter, wrap(async (req, res) => {
  const b = parse(z.object({ email: z.string().email() }), req.body);
  const token = await auth.requestPasswordReset(b.email);
  // Same response either way. Outside production the token is returned because no email service is configured.
  res.json({ ok: true, ...(!config.isProd && token ? { devToken: token } : {}) });
}));

authRouter.post("/password-reset/confirm", authLimiter, wrap(async (req, res) => {
  const b = parse(z.object({ token: z.string().min(10), password }), req.body);
  await auth.confirmPasswordReset(b.token, b.password);
  res.json({ ok: true });
}));
