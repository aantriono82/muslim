import { describe, expect, it } from "vitest";
import { shouldPersistPrefetchStamp } from "./prefetch";

describe("shouldPersistPrefetchStamp", () => {
  it("returns true when at least one prefetch task succeeds", () => {
    const results: PromiseSettledResult<unknown>[] = [
      { status: "rejected", reason: new Error("network") },
      { status: "fulfilled", value: { ok: true } },
    ];

    expect(shouldPersistPrefetchStamp(results)).toBe(true);
  });

  it("returns false when all prefetch tasks fail", () => {
    const results: PromiseSettledResult<unknown>[] = [
      { status: "rejected", reason: new Error("network") },
      { status: "rejected", reason: new Error("timeout") },
    ];

    expect(shouldPersistPrefetchStamp(results)).toBe(false);
  });
});
