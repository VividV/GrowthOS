/**
 * AI provider abstraction shared by every product.
 *
 * Products register *tools* (functions that fetch authorised data); the
 * provider runs a bounded tool-use loop and returns the final answer plus an
 * audit trail of tool calls and token usage. Models never receive database
 * access — only the structured results our tools return.
 */
export * from "./types";

/** USD per million tokens. Used only for internal cost estimates (admin dashboard). */
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-fable-5-2": { input: 8, output: 40 },
};

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = MODEL_PRICING[model];
  if (!p) return 0;
  return Number(((inputTokens * p.input + outputTokens * p.output) / 1_000_000).toFixed(6));
}

export { AnthropicProvider } from "./anthropic";
export { createProvider, type ProviderConfig } from "./registry";
