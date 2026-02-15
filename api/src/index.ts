import { Hono } from "hono";
import type { Context } from "hono";
import users from "./users";

export const app = new Hono().basePath("/api");

const toPositiveInt = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const normalized = Math.floor(parsed);
  return normalized > 0 ? normalized : fallback;
};

const normalizeOptionalToken = (value: unknown) => {
  if (typeof value !== "string") return "";
  return value.trim();
};

const WRITE_TOKEN = normalizeOptionalToken(process.env.API_WRITE_TOKEN);
const READ_ONLY_MODE = /^(1|true|yes)$/i.test(
  normalizeOptionalToken(process.env.READ_ONLY_MODE),
);
const MAX_BODY_BYTES = toPositiveInt(process.env.MAX_BODY_BYTES, 256 * 1024);
const WRITE_RATE_LIMIT_WINDOW_MS =
  toPositiveInt(process.env.WRITE_RATE_LIMIT_WINDOW_SECONDS, 60) * 1000;
const WRITE_RATE_LIMIT_MAX = toPositiveInt(
  process.env.WRITE_RATE_LIMIT_MAX,
  120,
);
const METHODS_WITH_BODY = new Set(["POST", "PUT", "PATCH", "DELETE"]);

type RateBucket = {
  count: number;
  resetAt: number;
};

const writeRateBuckets = new Map<string, RateBucket>();

const applySecurityHeaders = (c: Context) => {
  c.header("x-content-type-options", "nosniff");
  c.header("x-frame-options", "DENY");
  c.header("referrer-policy", "no-referrer");
  c.header("permissions-policy", "geolocation=(), microphone=(), camera=()");
  c.header("x-permitted-cross-domain-policies", "none");
  c.header(
    "content-security-policy",
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  );
};

const getClientIp = (c: Context) => {
  const forwardedFor = c.req.header("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = c.req.header("x-real-ip")?.trim();
  if (realIp) return realIp;
  return "unknown";
};

const isUsersWritePath = (path: string) =>
  path === "/api/users" ||
  path.startsWith("/api/users/") ||
  path === "/users" ||
  path.startsWith("/users/");

app.use("*", async (c, next) => {
  applySecurityHeaders(c);
  await next();
});

app.use("*", async (c, next) => {
  if (!METHODS_WITH_BODY.has(c.req.method)) {
    await next();
    return;
  }

  const contentLengthHeader = c.req.header("content-length");
  if (!contentLengthHeader) {
    await next();
    return;
  }

  const contentLength = Number.parseInt(contentLengthHeader, 10);
  if (!Number.isFinite(contentLength) || contentLength < 0) {
    return c.json(
      { status: false, message: "Content-Length tidak valid." },
      400,
    );
  }

  if (contentLength > MAX_BODY_BYTES) {
    return c.json(
      {
        status: false,
        message: `Body request terlalu besar. Maksimal ${MAX_BODY_BYTES} bytes.`,
      },
      413,
    );
  }

  await next();
});

app.use("*", async (c, next) => {
  if (!METHODS_WITH_BODY.has(c.req.method) || !isUsersWritePath(c.req.path)) {
    await next();
    return;
  }

  if (READ_ONLY_MODE) {
    return c.json(
      {
        status: false,
        message:
          "Server sedang dalam mode read-only. Tulis data dinonaktifkan.",
      },
      503,
    );
  }

  if (WRITE_TOKEN) {
    const authHeader = c.req.header("authorization")?.trim() ?? "";
    if (authHeader !== `Bearer ${WRITE_TOKEN}`) {
      return c.json(
        { status: false, message: "Unauthorized. Token tidak valid." },
        401,
      );
    }
  }

  const now = Date.now();
  const ip = getClientIp(c);
  const key = `users-write:${ip}`;
  const bucket = writeRateBuckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    writeRateBuckets.set(key, {
      count: 1,
      resetAt: now + WRITE_RATE_LIMIT_WINDOW_MS,
    });
    await next();
    return;
  }

  if (bucket.count >= WRITE_RATE_LIMIT_MAX) {
    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    c.header("retry-after", String(retryAfter));
    return c.json(
      {
        status: false,
        message: "Terlalu banyak request tulis. Coba lagi nanti.",
      },
      429,
    );
  }

  bucket.count += 1;

  if (writeRateBuckets.size > 4096) {
    for (const [bucketKey, entry] of writeRateBuckets) {
      if (entry.resetAt <= now) {
        writeRateBuckets.delete(bucketKey);
      }
    }
  }

  await next();
});

app.onError((err, c) => {
  console.error(err);
  applySecurityHeaders(c);
  return c.json({ status: false, message: "Terjadi kesalahan server." }, 500);
});

app.get("/", (c) =>
  c.json({
    status: true,
    message: "API berjalan.",
    readOnly: READ_ONLY_MODE,
  }),
);

app.route("/users", users);

const port = Number(process.env.PORT ?? 4001);

if (import.meta.main) {
  console.log(`Server berjalan di http://localhost:${port}/api`);

  Bun.serve({
    port,
    fetch: app.fetch,
  });
}

export default app;
