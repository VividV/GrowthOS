import Anthropic from "@anthropic-ai/sdk";
import { betaTool } from "@anthropic-ai/sdk/helpers/beta/json-schema";
import type { AgentResult, AIProvider, AITool, RunAgentInput, ToolCallRecord } from "./types";
import { AIUnavailableError } from "./types";

/**
 * Claude provider using the SDK tool runner. Each tool's run() performs its own
 * authorisation and validation; failures are returned to the model as tool
 * errors so it can explain the gap instead of guessing numbers.
 */
export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic";
  private client: Anthropic | null = null;

  constructor(readonly model: string = "claude-opus-5-5", private apiKey: string | undefined = process.env.ANTHROPIC_API_KEY) {}

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  private getClient(): Anthropic {
    if (!this.apiKey) throw new AIUnavailableError();
    this.client ??= new Anthropic({ apiKey: this.apiKey, maxRetries: 2, timeout: 120_000 });
    return this.client;
  }

  async runAgent(input: RunAgentInput): Promise<AgentResult> {
    const client = this.getClient();
    const toolCalls: ToolCallRecord[] = [];

    const tools = input.tools.map((t: AITool) =>
      betaTool({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema as { type: "object" },
        run: async (args: unknown) => {
          try {
            const result = await t.run(args);
            toolCalls.push({ name: t.name, input: args, summary: result.summary, ok: true });
            return JSON.stringify(result.data);
          } catch (err) {
            const message = err instanceof Error ? err.message : "Tool failed";
            toolCalls.push({ name: t.name, input: args, summary: message, ok: false });
            // Surfaced to the model as an error result; it must not fabricate the missing data.
            return JSON.stringify({ error: message, note: "No data available from this tool. Do not estimate or invent figures." });
          }
        },
      }),
    );

    const runner = client.beta.messages.toolRunner(
      {
        model: this.model,
        max_tokens: input.maxOutputTokens ?? 8000,
        max_iterations: input.maxRounds ?? 6,
        system: input.system,
        // Business Q&A is chat-like: low effort keeps answers fast and cheap; correctness comes from the tools.
        output_config: { effort: "low" },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        tools,
        messages: input.history.map((m) => ({ role: m.role, content: m.content })),
      },
      { signal: input.signal },
    );

    let inputTokens = 0;
    let outputTokens = 0;
    let last: Anthropic.Beta.BetaMessage | null = null;
    for await (const message of runner) {
      inputTokens += message.usage.input_tokens + (message.usage.cache_read_input_tokens ?? 0) + (message.usage.cache_creation_input_tokens ?? 0);
      outputTokens += message.usage.output_tokens;
      last = message;
    }

    let text = "";
    if (last) {
      for (const block of last.content) if (block.type === "text") text += block.text;
    }
    if (last?.stop_reason === "refusal") {
      text = "I can't help with that request. Try asking about your sales, customers, stock or finances.";
    } else if (last?.stop_reason === "max_tokens") {
      text += "\n\n_(Answer truncated — ask a narrower question for the full detail.)_";
    } else if (!text.trim()) {
      text = "I wasn't able to complete that analysis. Please try rephrasing the question.";
    }

    return {
      text: text.trim(),
      toolCalls,
      usage: { inputTokens, outputTokens },
      model: last?.model ?? this.model,
      provider: this.name,
      stopReason: last?.stop_reason ?? null,
    };
  }
}
