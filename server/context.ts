import { chat, type OllamaMessage } from "./ollama";
import { config } from "./config";
import { log } from "./log";

/**
 * Step 1: Trim all tool result messages to short summaries.
 * Tool results are only useful for the immediate response —
 * once the model has used them, the full content is waste.
 */
export function trimToolResults(messages: OllamaMessage[]): OllamaMessage[] {
  return messages.map((msg) => {
    if (msg.role !== "tool" || msg.content.length <= 150) return msg;
    const preview = msg.content.slice(0, 150).replace(/\n/g, " ");
    return { ...msg, content: `${preview}... [trimmed]` };
  });
}

/**
 * Step 2: Drop raw tool results entirely from older turns.
 * Keep only the assistant responses that already summarize the data.
 * Preserves the last `keepRecentTurns` user/assistant pairs fully intact.
 */
export function dropOldToolResults(
  messages: OllamaMessage[],
  keepRecentMessages: number = 8
): OllamaMessage[] {
  if (messages.length <= keepRecentMessages) return messages;

  const cutoff = messages.length - keepRecentMessages;
  return messages.filter((msg, i) => {
    // Always keep recent messages
    if (i >= cutoff) return true;
    // Drop tool results and tool-call assistant messages from old turns
    if (msg.role === "tool") return false;
    if (msg.role === "assistant" && msg.tool_calls?.length) return false;
    return true;
  });
}

/**
 * Step 3: Summarize older conversation into a compact recap.
 * Keeps the last `keepRecent` messages intact.
 */
async function summarizeOlderMessages(
  messages: OllamaMessage[]
): Promise<OllamaMessage[]> {
  const keepRecent = 6; // last 3 turns
  if (messages.length <= keepRecent + 2) return messages;

  const toSummarize = messages.slice(0, -keepRecent);
  const recent = messages.slice(-keepRecent);

  // Build text for summarization — only user/assistant content
  const text = toSummarize
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => `${m.role}: ${m.content.slice(0, 300)}`)
    .join("\n");

  if (!text.trim()) return messages;

  const res = await chat([
    {
      role: "system",
      content:
        "Summarize this conversation in 2-3 sentences. Keep all key facts, user preferences, and decisions. Be very concise.",
    },
    { role: "user", content: text },
  ]);

  return [
    {
      role: "user",
      content: `[Conversation summary: ${res.message.content}]`,
    },
    {
      role: "assistant",
      content:
        "Understood, I have the full context from our previous conversation.",
    },
    ...recent,
  ];
}

/**
 * Full auto-optimization pipeline.
 * Called after each response. Aggressive mode triggers at 80% context usage.
 *
 * Returns the optimized messages and whether optimization was performed.
 */
export async function optimizeContext(
  messages: OllamaMessage[],
  tokenCount: number
): Promise<{ messages: OllamaMessage[]; optimized: boolean }> {
  const threshold = config.ollama.numCtx * 0.8;
  let result = messages;
  let optimized = false;

  // Always trim tool results from past turns (cheap, no quality loss)
  result = trimToolResults(result);

  if (tokenCount > threshold) {
    log.info("context", `optimization triggered: ${tokenCount} tokens > ${Math.round(threshold)} threshold (${messages.length} msgs)`);
    // Level 1: Drop old tool results entirely
    const before = result.length;
    result = dropOldToolResults(result);
    log.info("context", `level 1: dropped ${before - result.length} old tool msgs`);
    optimized = true;
  }

  if (tokenCount > threshold && result.length > 10) {
    // Level 2: Summarize older conversation
    log.info("context", `level 2: summarizing older messages`);
    result = await summarizeOlderMessages(result);
    log.info("context", `level 2: condensed to ${result.length} msgs`);
    optimized = true;
  }

  return { messages: result, optimized };
}
