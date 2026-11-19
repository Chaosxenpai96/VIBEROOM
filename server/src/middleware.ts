import type { NextFunction, Request, RequestHandler, Response } from "express";
import rateLimit from "express-rate-limit";
import { ZodError, type ZodTypeAny, type z } from "zod";
import { config } from "./config.js";
import { AppError, unauthorized } from "./lib/errors.js";
import { userFromToken, type AuthUser } from "./services/auth.js";

declare module "express-serve-static-core" {
  interface Request { user?: AuthUser; token?: string }
}

export const bearer = (req: Request) => {
  const h = req.headers.authorization;
  return h?.startsWith("Bearer ") ? h.slice(7) : null;
};

export const requireAuth: RequestHandler = async (req, _res, next) => {
  try {
    const token = bearer(req);
    if (!token) throw unauthorized();
    const user = await userFromToken(token);
    if (!user) throw unauthorized("Session expired, please sign in again");
    req.user = user;
    req.token = token;
    next();
  } catch (e) { next(e); }
};

export const wrap = (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler => (req, res, next) => {
  fn(req, res).catch(next);
};

export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const r = schema.safeParse(data);
  if (!r.success) {
    const first = r.error.issues[0];
    throw new AppError(400, "VALIDATION", `${first.path.join(".") || "request"}: ${first.message}`);
  }
  return r.data;
}

export const authLimiter = rateLimit({
  windowMs: 60_000, limit: config.rateLimitEnabled ? 10 : 100000, standardHeaders: true, legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Too many attempts, try again in a minute" } },
});
export const apiLimiter = rateLimit({
  windowMs: 60_000, limit: config.rateLimitEnabled ? 300 : 100000, standardHeaders: true, legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Too many requests" } },
});

export const errorHandler = (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError) return res.status(err.status).json({ error: { code: err.code, message: err.message } });
  if (err instanceof ZodError) return res.status(400).json({ error: { code: "VALIDATION", message: "Invalid request" } });
  console.error(err);
  res.status(500).json({ error: { code: "INTERNAL", message: "Something went wrong" } });
};
