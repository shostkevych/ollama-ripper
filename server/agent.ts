import { chatStreamWithTools, type OllamaMessage, type OllamaToolCall } from "./ollama";
import { getAllToolSpecs, executeTool } from "./tools/registry";
import { queryCloud, getCurrentCloudModel, CLOUD_THINK_REGEX } from "./tools/cloud-think";
import { consumeSearchSources } from "./tools/web-search";
import { config } from "./config";
import { log } from "./log";

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

function formatSourceLabel(url: string): string {
  const short = url.replace(/^https?:\/\/(www\.)?/, "");
  return short.length > 40 ? short.slice(0, 40) + "..." : short;
}

function appendSearchAttribution(response: string, sources: string[]): string {
  if (!sources.length) return response;
  return `${response}\n\n---\nBased on: [${formatSourceLabel(sources[0])}](${sources[0]})`;
}

export async function runAgent(
  messages: OllamaMessage[],
  onStatus?: (status: AgentStatus) => void,
  options?: { cloudMode?: boolean }
): Promise<string> {
  // Detect cloud think keywords or forced cloud mode — send full context to Claude via Agent SDK
  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
  if (options?.cloudMode || (lastUserMsg && CLOUD_THINK_REGEX.test(lastUserMsg.content))) {
    const cloudModel = getCurrentCloudModel();
    log.info("agent", `cloud mode → ${cloudModel} (${messages.length} msgs)`);
    onStatus?.({ type: "tool", name: "cloud_think", args: cloudModel });
    try {
      return await queryCloud(messages, onStatus as (status: { type: string; name: string; args: string }) => void);
    } catch (err) {
      log.error("agent", `cloud error: ${err instanceof Error ? err.message : String(err)}`);
      return `Cloud AI error: ${err instanceof Error ? err.message : String(err)}`;
    } finally {
      onStatus?.({ type: "tool_done", name: "cloud_think", args: cloudModel });
    }
  }

  const tools = getAllToolSpecs();
  const toolNames = new Set(tools.map((t) => t.function.name));
  let rounds = 0;
  let usedWebSearch = false;

  log.info("agent", `start → model=${config.ollama.model} msgs=${messages.length} tools=${tools.length}`);

  while (rounds < config.maxToolRounds) {
    log.info("agent", `round ${rounds + 1}/${config.maxToolRounds}`);
    onStatus?.({ type: "thinking" });

    const result = await chatStreamWithTools(messages, tools, (token) => {
      onStatus?.({ type: "stream", token });
    });

    if (result.promptEvalCount != null) {
      log.info("agent", `tokens → prompt=${result.promptEvalCount} completion=${result.evalCount ?? 0}`);
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
        log.info("agent", `parsed ${parsed.length} tool call(s) from text`);
      }
    }

    if (!toolCalls) {
      log.info("agent", `done → response ${(result.content ?? "").length} chars`);
      const response = result.content ?? "";
      if (usedWebSearch) {
        return appendSearchAttribution(response, consumeSearchSources());
      }
      return response;
    }

    // Cap tool calls per round
    if (toolCalls.length > config.maxToolCalls) {
      log.warn("agent", `capping tool calls from ${toolCalls.length} to ${config.maxToolCalls}`);
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
      log.info("agent", `tool → ${name}(${argsStr.slice(0, 100)})`);
      onStatus?.({ type: "tool", name, args: argsStr });

      if (name === "web_search") usedWebSearch = true;

      const toolResult = await executeTool(name, args);
      log.info("agent", `tool ← ${name} (${toolResult.length} chars)`);
      onStatus?.({ type: "tool_done", name, args: argsStr });

      messages.push({
        role: "tool",
        content: toolResult,
      });
    }

    rounds++;
  }

  // Safety: max rounds reached — force final answer without tools
  log.warn("agent", `max rounds (${config.maxToolRounds}) reached, forcing final answer`);
  onStatus?.({ type: "thinking" });
  let full = "";
  const finalResult = await chatStreamWithTools(messages, undefined, (token) => {
    full += token;
    onStatus?.({ type: "stream", token });
  });
  const finalResponse = finalResult.content;
  if (usedWebSearch) {
    return appendSearchAttribution(finalResponse, consumeSearchSources());
  }
  return finalResponse;
}
