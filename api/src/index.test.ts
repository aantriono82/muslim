import { describe, expect, it } from "bun:test";
import app from "./index";

describe("users api", () => {
  it("returns healthy status on /api", async () => {
    const response = await app.request("http://localhost/api");
    expect(response.status).toBe(200);

    const payload = (await response.json()) as {
      status?: boolean;
      message?: string;
    };
    expect(payload.status).toBe(true);
    expect(payload.message).toBe("API berjalan.");
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
});
