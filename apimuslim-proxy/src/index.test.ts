import { describe, expect, it } from "bun:test";
import app from "./index";

describe("apimuslim proxy guards", () => {
  it("returns healthy status on root", async () => {
    const response = await app.request("http://localhost/");
    expect(response.status).toBe(200);

    const payload = (await response.json()) as {
      status?: boolean;
      message?: string;
    };
    expect(payload.status).toBe(true);
    expect(payload.message).toBe("Proxy API Muslim berjalan.");
  });

  it("rejects quran partition numbers above supported range", async () => {
    const response = await app.request("http://localhost/api/quran/juz/31");
    expect(response.status).toBe(400);

    const payload = (await response.json()) as {
      status?: boolean;
      message?: string;
    };
    expect(payload.status).toBe(false);
    expect(payload.message).toBe("Nomor juz harus antara 1-30.");
  });

  it("rejects quran juz audio numbers above supported range", async () => {
    const response = await app.request(
      "http://localhost/api/quran/juz/31/audio",
    );
    expect(response.status).toBe(400);

    const payload = (await response.json()) as {
      status?: boolean;
      message?: string;
    };
    expect(payload.status).toBe(false);
    expect(payload.message).toBe("Nomor juz harus antara 1-30.");
  });

  it("rejects non-supported audio url credentials", async () => {
    const response = await app.request(
      "http://localhost/api/audio?url=http://user:pass@audio.qurancdn.com/a.mp3",
    );
    expect(response.status).toBe(400);

    const payload = (await response.json()) as {
      status?: boolean;
      message?: string;
    };
    expect(payload.status).toBe(false);
    expect(payload.message).toBe(
      "URL audio tidak boleh mengandung kredensial.",
    );
  });

  it("rejects audio host outside allow-list", async () => {
    const response = await app.request(
      "http://localhost/api/audio?url=https://example.com/a.mp3",
    );
    expect(response.status).toBe(403);

    const payload = (await response.json()) as {
      status?: boolean;
      message?: string;
    };
    expect(payload.status).toBe(false);
    expect(payload.message).toBe("Host audio tidak diizinkan.");
  });

  it("rejects doa detail id with non-numeric format", async () => {
    const response = await app.request("http://localhost/api/doa/harian/abc");
    expect(response.status).toBe(400);

    const payload = (await response.json()) as {
      status?: boolean;
      message?: string;
    };
    expect(payload.status).toBe(false);
    expect(payload.message).toBe("ID doa tidak valid.");
  });

  it("rejects doa search keyword longer than max length", async () => {
    const response = await app.request("http://localhost/api/doa/harian/cari", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ keyword: "x".repeat(101) }),
    });
    expect(response.status).toBe(400);

    const payload = (await response.json()) as {
      status?: boolean;
      message?: string;
    };
    expect(payload.status).toBe(false);
    expect(payload.message).toBe("Keyword maksimal 100 karakter.");
  });

  it("includes HEAD method in CORS preflight response", async () => {
    const response = await app.request(
      new Request("http://localhost/api/quran/juz/1", {
        method: "OPTIONS",
      }),
    );
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-methods")).toBe(
      "GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS",
    );
  });
});
