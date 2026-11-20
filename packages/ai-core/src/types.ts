/** Shared AI types (kept separate from index.ts to avoid import cycles). */
export interface AIToolResult {
  /** JSON-serialisable payload returned to the model. */
  data: unknown;
  /** Short human summary shown as a "source" chip in the UI. */
  summary: string;
}

export interface AITool {
  name: string;
  description: string;
  /** JSON Schema (object) describing the input. Inputs are re-validated server-side by the tool itself. */
  inputSchema: { type: "object"; properties: Record<string, unknown>; required?: string[]; additionalProperties?: boolean };
  run: (input: unknown) => Promise<AIToolResult>;
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ToolCallRecord {
  name: string;
  input: unknown;
  summary: string;
  ok: boolean;
}

export interface AgentResult {
  text: string;
  toolCalls: ToolCallRecord[];
  usage: { inputTokens: number; outputTokens: number };
  model: string;
  provider: string;
  stopReason: string | null;
}

export interface RunAgentInput {
  system: string;
  history: ChatTurn[];
  tools: AITool[];
  maxRounds?: number;
  maxOutputTokens?: number;
  signal?: AbortSignal;
}

export interface AIProvider {
  readonly name: string;
  readonly model: string;
  isConfigured(): boolean;
  runAgent(input: RunAgentInput): Promise<AgentResult>;
}

export class AIUnavailableError extends Error {
  constructor(message = "The AI assistant is not configured on this deployment.") {
    super(message);
    this.name = "AIUnavailableError";
  }
}

