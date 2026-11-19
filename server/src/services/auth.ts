import { config } from "../config.js";
import { pool } from "../db.js";
import { badRequest, conflict, unauthorized } from "../lib/errors.js";
import { hashPassword, randomToken, sha256, verifyPassword } from "../lib/crypto.js";

export interface AuthUser { id: string; email: string; displayName: string; avatarColor: string; bio?: string | null }

const COLORS = ["#8B5CF6", "#22D3EE", "#EC4899", "#F59E0B", "#10B981", "#3B82F6", "#EF4444"];
const toUser = (r: any): AuthUser => ({ id: r.id, email: r.email, displayName: r.display_name, avatarColor: r.avatar_color, bio: r.bio ?? null });

async function createSession(userId: string) {
  const token = randomToken();
  await pool.query(
    `INSERT INTO auth_sessions (user_id, token_hash, expires_at) VALUES ($1,$2, now() + ($3 || ' days')::interval)`,
    [userId, sha256(token), String(config.sessionTtlDays)]
  );
  return token;
}

export async function register(email: string, password: string, displayName: string) {
  const e = email.trim().toLowerCase();
  const exists = await pool.query("SELECT 1 FROM users WHERE email=$1", [e]);
  if (exists.rowCount) throw conflict("EMAIL_TAKEN", "An account with this email already exists");
  const color = COLORS[Math.floor(Math.random() * COLORS.length)];
  const r = await pool.query(
    `INSERT INTO users (email, display_name, password_hash, avatar_color) VALUES ($1,$2,$3,$4) RETURNING *`,
    [e, displayName.trim(), await hashPassword(password), color]
  );
  return { user: toUser(r.rows[0]), token: await createSession(r.rows[0].id) };
}

export async function login(email: string, password: string) {
  const r = await pool.query("SELECT * FROM users WHERE email=$1", [email.trim().toLowerCase()]);
  const row = r.rows[0];
  // Same error and similar work whether or not the account exists.
  const ok = row ? await verifyPassword(password, row.password_hash) : (await verifyPassword(password, "scrypt$AAAAAAAAAAAAAAAAAAAAAA==$AAAA"), false);
  if (!row || !ok) throw unauthorized("Invalid email or password");
  return { user: toUser(row), token: await createSession(row.id) };
}

export async function updateProfile(userId: string, p: { displayName?: string; bio?: string; avatarColor?: string }) {
  const r = await pool.query(
    `UPDATE users SET display_name=COALESCE($2,display_name), bio=COALESCE($3,bio), avatar_color=COALESCE($4,avatar_color) WHERE id=$1 RETURNING *`,
    [userId, p.displayName ?? null, p.bio ?? null, p.avatarColor ?? null]
  );
  return { ...toUser(r.rows[0]), bio: r.rows[0].bio as string | null };
}

export async function logout(token: string) {
  await pool.query("DELETE FROM auth_sessions WHERE token_hash=$1", [sha256(token)]);
}

export async function userFromToken(token: string): Promise<AuthUser | null> {
  const r = await pool.query(
    `SELECT u.* FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at > now()`,
    [sha256(token)]
  );
  return r.rows[0] ? toUser(r.rows[0]) : null;
}

/** Always succeeds from the caller's view so emails cannot be enumerated. No email service is wired up yet: in non-production the token is returned so the flow can be tested. */
export async function requestPasswordReset(email: string): Promise<string | null> {
  const r = await pool.query("SELECT id FROM users WHERE email=$1", [email.trim().toLowerCase()]);
  if (!r.rows[0]) return null;
  const token = randomToken();
  await pool.query(`INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1,$2, now() + interval '1 hour')`, [r.rows[0].id, sha256(token)]);
  if (!config.isProd) console.log(`[dev] password reset token for ${email}: ${token}`);
  return token;
}

export async function confirmPasswordReset(token: string, newPassword: string) {
  const r = await pool.query(
    `UPDATE password_resets SET used_at=now() WHERE token_hash=$1 AND used_at IS NULL AND expires_at > now() RETURNING user_id`,
    [sha256(token)]
  );
  if (!r.rows[0]) throw badRequest("INVALID_RESET_TOKEN", "This reset link is invalid or has expired");
  await pool.query("UPDATE users SET password_hash=$1 WHERE id=$2", [await hashPassword(newPassword), r.rows[0].user_id]);
  await pool.query("DELETE FROM auth_sessions WHERE user_id=$1", [r.rows[0].user_id]);
}
