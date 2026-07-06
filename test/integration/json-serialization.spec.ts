import { exports } from "cloudflare:workers";
import { describe, it, expect } from "vitest";

describe("JSON serialization", () => {
  it("serializes AmountRecord correctly", async () => {
    const response = await exports.default.fetch("http://example.com/entries");
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(`[{}]`);
  });
});
