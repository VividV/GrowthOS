import type { AIProvider, RunAgentInput, AgentResult } from "./types";
import { AIUnavailableError } from "./types";
import { AnthropicProvider } from "./anthropic";

/**
 * Non-secret provider selection (stored in platform_settings and editable by
 * platform admins). Credentials always come from server env vars.
 * New providers implement AIProvider and register here.
 */
export interface ProviderConfig {
  provider: string;
  model: string;
}

class DisabledProvider implements AIProvider {
  readonly name = "disabled";
  readonly model = "none";
  isConfigured() {
    return false;
  }
  async runAgent(_: RunAgentInput): Promise<AgentResult> {
    throw new AIUnavailableError();
  }
}

export function createProvider(config: ProviderConfig | null | undefined): AIProvider {
  switch (config?.provider ?? "anthropic") {
    case "anthropic":
      return new AnthropicProvider(config?.model || "claude-opus-5-5");
    case "disabled":
      return new DisabledProvider();
    default:
      return new DisabledProvider();
  }
}
