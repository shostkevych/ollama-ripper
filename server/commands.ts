import type { OllamaMessage } from "./ollama";
import { chat } from "./ollama";
import { optimizeContext, trimToolResults, dropOldToolResults } from "./context";
import { config } from "./config";
import { saveConversation } from "./db";

export interface CommandResult {
  systemMessage?: string;
  errorMessage?: string;
}

export async function handleSaveCommand(agentMsgs: OllamaMessage[]): Promise<CommandResult> {
  if (agentMsgs.length < 2) {
    return { errorMessage: "Nothing to save — conversation is too short." };
  }

  const model = config.ollama.model;

  const excerpt = agentMsgs
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n")
    .slice(0, 2000);

  const titleRes = await chat([
    { role: "system", content: "Generate a short title (max 6 words) for this conversation. Reply with ONLY the title, no quotes or punctuation." },
    { role: "user", content: excerpt },
  ]);
  const title = titleRes.message.content.trim().replace(/^["']|["']$/g, "");

  const fullTranscript = agentMsgs
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");

  const summaryRes = await chat([
    { role: "system", content: "Summarize this conversation in detail. Include key topics, decisions, and any code or commands discussed. Be thorough but concise." },
    { role: "user", content: fullTranscript },
  ]);
  const summary = summaryRes.message.content.trim();

  saveConversation(title, summary, model);
  return { systemMessage: `Conversation saved: "${title}"` };
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
