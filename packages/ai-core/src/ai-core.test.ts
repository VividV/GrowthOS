import { describe, expect, it } from "vitest";
import { createProvider, estimateCostUsd, AIUnavailableError } from "./index";

describe("ai-core", () => {
  it("estimates cost from token usage", () => {
    expect(estimateCostUsd("claude-opus-5-5", 1_000_000, 0)).toBe(4);
    expect(estimateCostUsd("claude-opus-5-5", 10_000, 2_000)).toBeCloseTo(0.08, 6);
    expect(estimateCostUsd("unknown", 1000, 1000)).toBe(0);
  });

  it("reports unconfigured providers instead of pretending to work", async () => {
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    const p = createProvider({ provider: "anthropic", model: "claude-opus-5-5" });
    expect(p.isConfigured()).toBe(false);
    await expect(p.runAgent({ system: "", history: [{ role: "user", content: "hi" }], tools: [] })).rejects.toBeInstanceOf(AIUnavailableError);
    if (saved) process.env.ANTHROPIC_API_KEY = saved;
  });

  it("disabled provider never calls out", async () => {
    const p = createProvider({ provider: "disabled", model: "x" });
    await expect(p.runAgent({ system: "", history: [], tools: [] })).rejects.toBeInstanceOf(AIUnavailableError);
  });
});
