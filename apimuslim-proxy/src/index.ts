import { Hono } from "hono";
import type { Context } from "hono";
import apimuslimSpec from "../apimuslim.json";

const app = new Hono();

const TARGET_ORIGIN = process.env.TARGET_ORIGIN ?? "https://api.myquran.com";
const DOA_ORIGIN = process.env.DOA_ORIGIN ?? "https://equran.id";
const DOA_BASE = process.env.DOA_BASE ?? "/api/doa";
const DOA_TTL = Number(process.env.DOA_TTL ?? 3600);
const normalizePrefix = (value: string) => {
  const withSlash = value.startsWith("/") ? value : `/${value}`;
  const trimmed = withSlash.replace(/\/+$/, "");
  return trimmed || "/";
};
const PRIMARY_PREFIX = normalizePrefix(process.env.PROXY_PREFIX ?? "/api");
const ALT_PREFIX = normalizePrefix(
  process.env.ALT_PREFIX ?? (PRIMARY_PREFIX === "/api" ? "/v3" : "/api"),
);
const UPSTREAM_PREFIX = normalizePrefix(process.env.UPSTREAM_PREFIX ?? "/v3");
const PROXY_PREFIXES = Array.from(new Set([PRIMARY_PREFIX, ALT_PREFIX]));
const PORT = Number(process.env.PORT ?? 3000);
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL;

type DoaItem = {
  id: number;
  grup?: string;
  nama?: string;
  ar?: string;
  tr?: string;
  idn?: string;
  tentang?: string;
  tag?: string[];
  audio_url?: unknown;
  audio?: unknown;
  audioUrl?: unknown;
  audio_mp3?: unknown;
};

type DoaCache = {
  data: DoaItem[];
  fetchedAt: number;
};

let doaCache: DoaCache | null = null;

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const resolveAudioUrl = (value: unknown): string | null => {
  if (typeof value === "string" && value.trim()) return value;
  if (!value) return null;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const hit = resolveAudioUrl(entry);
      if (hit) return hit;
    }
    return null;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const preferredKeys = ["01", "1", "default", "primary"];
    for (const key of preferredKeys) {
      const hit = resolveAudioUrl(record[key]);
      if (hit) return hit;
    }
    for (const entry of Object.values(record)) {
      const hit = resolveAudioUrl(entry);
      if (hit) return hit;
    }
  }
  return null;
};

const getDoaAudioUrl = (item: DoaItem) =>
  resolveAudioUrl(
    item.audio_url ?? item.audio ?? item.audioUrl ?? item.audio_mp3,
  );

const normalizeDoa = (item: DoaItem) => ({
  id: item.id,
  title: item.nama ?? "",
  name: item.nama ?? "",
  arabic: item.ar ?? "",
  translation: item.idn ?? "",
  transliteration: item.tr ?? "",
  source: item.tentang ?? "",
  category: item.grup ?? "",
  tags: item.tag ?? [],
  audio_url: getDoaAudioUrl(item),
});

const fetchDoaList = async (): Promise<DoaItem[]> => {
  const now = Date.now();
  if (doaCache && now - doaCache.fetchedAt < DOA_TTL * 1000) {
    return doaCache.data;
  }

  const response = await fetch(`${DOA_ORIGIN}${DOA_BASE}`);
  if (!response.ok) {
    throw new Error("Gagal mengambil data doa.");
  }

  const payload = (await response.json()) as { data?: DoaItem[] };
  const data = Array.isArray(payload?.data) ? payload.data : [];
  doaCache = { data, fetchedAt: now };
  return data;
};

const fetchDoaDetail = async (id: string): Promise<DoaItem | null> => {
  const response = await fetch(`${DOA_ORIGIN}${DOA_BASE}/${id}`);
  if (!response.ok) {
    return null;
  }
  const payload = (await response.json()) as { data?: DoaItem };
  return payload?.data ?? null;
};

app.use("*", async (c, next) => {
  c.header("access-control-allow-origin", "*");
  c.header("access-control-allow-headers", "Content-Type, Authorization");
  c.header("access-control-allow-methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  if (c.req.method === "OPTIONS") {
    return c.text("", 204);
  }
  await next();
});

const buildOpenApi = () => {
  if (!PUBLIC_BASE_URL) return apimuslimSpec;
  const base = PUBLIC_BASE_URL.replace(/\/$/, "");
  const url = base.endsWith(PRIMARY_PREFIX) ? base : `${base}${PRIMARY_PREFIX}`;
  return {
    ...apimuslimSpec,
    servers: [
      {
        url,
        description: "Local proxy",
      },
    ],
  };
};

app.onError((err, c) => {
  console.error(err);
  return c.json({ status: false, message: "Terjadi kesalahan server." }, 500);
});

app.get("/", (c) =>
  c.json({
    status: true,
    message: "Proxy API Muslim berjalan.",
    proxyPrefix: PRIMARY_PREFIX,
    proxyPrefixes: PROXY_PREFIXES,
    upstream: `${TARGET_ORIGIN}${UPSTREAM_PREFIX}`,
  }),
);

app.get("/openapi.json", (c) => c.json(buildOpenApi()));

app.get("/docs", (c) => {
  const html = `<!doctype html>
<html lang="id">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>API Muslim Docs</title>
    <link
      rel="stylesheet"
      href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css"
    />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      window.ui = SwaggerUIBundle({
        url: '/openapi.json',
        dom_id: '#swagger-ui'
      });
    </script>
  </body>
</html>`;

  return c.html(html);
});

const registerDoaRoutes = (prefix: string) => {
  app.get(`${prefix}/doa/harian`, async (c) => {
    const list = await fetchDoaList();
    const categories = new Map<
      string,
      { id: string; title: string; total: number; audio_total: number }
    >();

    list.forEach((item) => {
      const groupName = item.grup ?? "Lainnya";
      const slug = slugify(groupName) || "lainnya";
      const current = categories.get(slug) ?? {
        id: slug,
        title: groupName,
        total: 0,
        audio_total: 0,
      };
      current.total += 1;
      if (getDoaAudioUrl(item)) {
        current.audio_total += 1;
      }
      categories.set(slug, current);
    });

    const data = Array.from(categories.values()).sort((a, b) =>
      a.title.localeCompare(b.title),
    );

    return c.json({ status: true, message: "success", data });
  });

  app.get(`${prefix}/doa/harian/kategori/:id`, async (c) => {
    const slug = c.req.param("id");
    const list = await fetchDoaList();
    const data = list
      .filter((item) => slugify(item.grup ?? "lainnya") === slug)
      .map(normalizeDoa);
    return c.json({ status: true, message: "success", data });
  });

  app.post(`${prefix}/doa/harian/cari`, async (c) => {
    let body: { keyword?: string } = {};
    try {
      body = await c.req.json();
    } catch {
      return c.json({ status: false, message: "Body JSON tidak valid." }, 400);
    }

    const keyword = (body.keyword ?? "").toString().trim().toLowerCase();
    if (!keyword) {
      return c.json({ status: false, message: "Keyword wajib diisi." }, 400);
    }

    const list = await fetchDoaList();
    const filtered = list.filter((item) => {
      const haystack = [item.nama, item.idn, item.grup, item.tentang, item.tr]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const tagMatch = item.tag?.some((tag) =>
        tag.toLowerCase().includes(keyword),
      );
      return haystack.includes(keyword) || Boolean(tagMatch);
    });

    const data = filtered.slice(0, 50).map(normalizeDoa);
    return c.json({ status: true, message: "success", data });
  });

  app.get(`${prefix}/doa/harian/random`, async (c) => {
    const list = await fetchDoaList();
    if (list.length === 0) {
      return c.json({ status: false, message: "Data doa kosong." }, 404);
    }
    const item = list[Math.floor(Math.random() * list.length)];
    return c.json({
      status: true,
      message: "success",
      data: normalizeDoa(item),
    });
  });

  app.get(`${prefix}/doa/harian/:id`, async (c) => {
    const id = c.req.param("id");
    const item = await fetchDoaDetail(id);
    if (!item) {
      return c.json({ status: false, message: "Doa tidak ditemukan." }, 404);
    }
    return c.json({
      status: true,
      message: "success",
      data: normalizeDoa(item),
    });
  });
};

PROXY_PREFIXES.forEach((prefix) => registerDoaRoutes(prefix));

const createProxyHandler = (prefix: string) => async (c: Context) => {
  const url = new URL(c.req.raw.url);
  const incomingPath = url.pathname;
  const trimmedPath = incomingPath.startsWith(prefix)
    ? incomingPath.slice(prefix.length)
    : incomingPath;
  const targetPath = `${UPSTREAM_PREFIX}${trimmedPath}`;
  const targetUrl = new URL(targetPath + url.search, TARGET_ORIGIN);

  const headers = new Headers(c.req.raw.headers);
  headers.delete("host");
  headers.delete("content-length");
  if (!headers.has("user-agent")) {
    headers.set("user-agent", "Mozilla/5.0 (MuslimKit)");
  }
  if (!headers.has("accept")) {
    headers.set("accept", "application/json");
  }

  const method = c.req.method;
  const body =
    method === "GET" || method === "HEAD" ? undefined : c.req.raw.body;

  const upstreamResponse = await fetch(targetUrl.toString(), {
    method,
    headers,
    body,
    redirect: "manual",
  });

  const responseHeaders = new Headers(upstreamResponse.headers);
  responseHeaders.delete("content-encoding");
  responseHeaders.delete("content-length");
  responseHeaders.delete("transfer-encoding");
  responseHeaders.set("x-proxy-target", TARGET_ORIGIN);
  responseHeaders.set("access-control-allow-origin", "*");

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders,
  });
};

PROXY_PREFIXES.forEach((prefix) => {
  const handler = createProxyHandler(prefix);
  app.all(`${prefix}`, handler);
  app.all(`${prefix}/*`, handler);
});

console.log(`Proxy berjalan di http://localhost:${PORT}`);
console.log(`Prefix aktif: ${PROXY_PREFIXES.join(", ")}`);
console.log(`Docs: http://localhost:${PORT}/docs`);

Bun.serve({
  port: PORT,
  fetch: app.fetch,
});
