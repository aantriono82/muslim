import { describe, expect, it } from "bun:test";
import app from "./index";

describe("users api", () => {
  it("returns healthy status on /api", async () => {
    const response = await app.request("http://localhost/api");
    expect(response.status).toBe(200);

    const payload = (await response.json()) as {
      status?: boolean;
      message?: string;
      readOnly?: boolean;
    };
    expect(payload.status).toBe(true);
    expect(payload.message).toBe("API berjalan.");
    expect(payload.readOnly).toBe(false);
  });

  it("adds baseline security headers", async () => {
    const response = await app.request("http://localhost/api");

    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("permissions-policy")).toBe(
      "geolocation=(), microphone=(), camera=()",
    );
  });

  it("rejects write request body above limit", async () => {
    const body = JSON.stringify({
      name: "Tester",
      email: "oversize@example.com",
    });
    const response = await app.request(
      new Request("http://localhost/api/users", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": "300000",
        },
        body,
      }),
    );

    expect(response.status).toBe(413);
    const payload = (await response.json()) as {
      status?: boolean;
      message?: string;
    };
    expect(payload.status).toBe(false);
  });

  it("rejects search query longer than 100 chars", async () => {
    const keyword = "x".repeat(101);
    const response = await app.request(
      `http://localhost/api/users?q=${keyword}`,
    );

    expect(response.status).toBe(400);
    const payload = (await response.json()) as {
      status?: boolean;
      message?: string;
    };
    expect(payload.status).toBe(false);
    expect(payload.message).toBe("Pencarian maksimal 100 karakter.");
  });

  it("rejects non-numeric user id format on id routes", async () => {
    const cases = [
      new Request("http://localhost/api/users/1abc"),
      new Request("http://localhost/api/users/1abc", { method: "PUT" }),
      new Request("http://localhost/api/users/1abc", { method: "PATCH" }),
      new Request("http://localhost/api/users/1abc", { method: "DELETE" }),
    ];

    for (const request of cases) {
      const response = await app.request(request);
      expect(response.status).toBe(400);
      const payload = (await response.json()) as {
        status?: boolean;
        message?: string;
      };
      expect(payload.status).toBe(false);
      expect(payload.message).toBe("ID tidak valid.");
    }
  });
});
