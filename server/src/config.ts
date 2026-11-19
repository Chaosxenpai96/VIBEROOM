import "dotenv/config";

const num = (v: string | undefined, d: number) => (v !== undefined && v !== "" && !Number.isNaN(Number(v)) ? Number(v) : d);

export const config = {
  port: num(process.env.PORT, 4000),
  databaseUrl: process.env.DATABASE_URL ?? "postgresql://viberoom:viberoom@localhost:5432/viberoom",
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
  sessionTtlDays: num(process.env.SESSION_TTL_DAYS, 30),
  /** How long a disconnected host keeps the host role before another online member is promoted. */
  hostGraceMs: num(process.env.HOST_GRACE_MS, 15000),
  isProd: process.env.NODE_ENV === "production",
  rateLimitEnabled: process.env.DISABLE_RATE_LIMIT !== "1",
  maxQueuedPerUser: num(process.env.MAX_QUEUED_PER_USER, 5),
  spotify: {
    clientId: process.env.SPOTIFY_CLIENT_ID ?? "",
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET ?? "",
    redirectUri: process.env.SPOTIFY_REDIRECT_URI ?? "",
  },
};
