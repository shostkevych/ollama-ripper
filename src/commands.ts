import type { OllamaMessage } from "./ollama";
import { optimizeContext, trimToolResults, dropOldToolResults } from "./context";
import { config } from "./config";

export interface CommandResult {
  systemMessage?: string;
  errorMessage?: string;
}

export function handleNewCommand(agentMsgs: OllamaMessage[]): CommandResult {
  agentMsgs.length = 0;
  return { systemMessage: "Conversation cleared." };
}

export async function handleCompactCommand(agentMsgs: OllamaMessage[]): Promise<{ messages: OllamaMessage[]; result: CommandResult }> {
  try {
    let result = trimToolResults(agentMsgs);
    result = dropOldToolResults(result);
    const { messages: optimized } = await optimizeContext(result, config.ollama.numCtx);
    return { messages: optimized, result: { systemMessage: "Context compacted." } };
  } catch (err) {
    return {
      messages: agentMsgs,
      result: { errorMessage: `Compact failed: ${err instanceof Error ? err.message : String(err)}` },
    };
  }
}
