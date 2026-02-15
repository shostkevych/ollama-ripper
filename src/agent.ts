import { chatStreamWithTools, type OllamaMessage, type OllamaToolCall } from "./ollama";
import { getAllToolSpecs, executeTool } from "./tools/registry";
import { queryOpenAI, CLOUD_THINK_REGEX } from "./tools/cloud-think";
import { config } from "./config";

export type AgentStatus =
  | { type: "thinking" }
  | { type: "tool"; name: string; args: string }
  | { type: "tool_done"; name: string; args: string }
  | { type: "tokens"; prompt: number; completion: number }
  | { type: "stream"; token: string };

/**
 * Some models output tool calls as JSON text in the content field
 * instead of using the structured tool_calls field. This extracts
 * {"name": "...", "arguments": {...}} objects from anywhere in the text.
 */
function parseToolCallsFromText(content: string): OllamaToolCall[] | null {
  const calls: OllamaToolCall[] = [];
  let i = 0;

  while (i < content.length) {
    if (content[i] !== "{") {
      i++;
      continue;
    }

    let depth = 0;
    let start = i;
    for (let j = i; j < content.length; j++) {
      if (content[j] === "{") depth++;
      else if (content[j] === "}") depth--;

      if (depth === 0) {
        const candidate = content.slice(start, j + 1);
        try {
          const parsed = JSON.parse(candidate);
          if (parsed.name && typeof parsed.name === "string" && parsed.arguments) {
            calls.push({ function: { name: parsed.name, arguments: parsed.arguments } });
          }
        } catch {
          // Not valid JSON — skip
        }
        i = j + 1;
        break;
      }
    }

    if (depth !== 0) i = start + 1;
  }

  return calls.length ? calls : null;
}

export async function runAgent(
  messages: OllamaMessage[],
  onStatus?: (status: AgentStatus) => void
): Promise<string> {
  // Detect cloud think keywords — send full context directly to OpenAI, skip Ollama
  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
  if (lastUserMsg && CLOUD_THINK_REGEX.test(lastUserMsg.content)) {
    onStatus?.({ type: "tool", name: "cloud_think", args: config.openai.model });
    try {
      return await queryOpenAI(messages, onStatus);
    } catch (err) {
      return `Cloud AI error: ${err instanceof Error ? err.message : String(err)}`;
    } finally {
      onStatus?.({ type: "tool_done", name: "cloud_think", args: config.openai.model });
    }
  }

  const tools = getAllToolSpecs();
  const toolNames = new Set(tools.map((t) => t.function.name));
  let rounds = 0;

  while (rounds < config.maxToolRounds) {
    onStatus?.({ type: "thinking" });

    const result = await chatStreamWithTools(messages, tools, (token) => {
      onStatus?.({ type: "stream", token });
    });

    if (result.promptEvalCount != null) {
      onStatus?.({
        type: "tokens",
        prompt: result.promptEvalCount,
        completion: result.evalCount ?? 0,
      });
    }

    // Check structured tool_calls first, then fallback to text parsing
    let toolCalls = result.toolCalls?.length ? result.toolCalls : null;
    if (!toolCalls && result.content) {
      const parsed = parseToolCallsFromText(result.content);
      if (parsed?.every((tc) => toolNames.has(tc.function.name))) {
        toolCalls = parsed;
      }
    }

    if (!toolCalls) {
      return result.content ?? "";
    }

    // Cap tool calls per round
    if (toolCalls.length > config.maxToolCalls) {
      toolCalls = toolCalls.slice(0, config.maxToolCalls);
    }

    // Append assistant message (with content cleared if it was a text-based tool call)
    messages.push({
      role: "assistant",
      content: result.toolCalls?.length ? result.content : "",
      tool_calls: toolCalls,
    });

    // Execute each tool call
    for (const tc of toolCalls) {
      const { name, arguments: args } = tc.function;
      const argsStr = Object.values(args).join(", ");
      onStatus?.({ type: "tool", name, args: argsStr });

      const toolResult = await executeTool(name, args);
      onStatus?.({ type: "tool_done", name, args: argsStr });

      messages.push({
        role: "tool",
        content: toolResult,
      });
    }

    rounds++;
  }

  // Safety: max rounds reached — force final answer without tools
  onStatus?.({ type: "thinking" });
  let full = "";
  const finalResult = await chatStreamWithTools(messages, undefined, (token) => {
    full += token;
    onStatus?.({ type: "stream", token });
  });
  return finalResult.content;
}
