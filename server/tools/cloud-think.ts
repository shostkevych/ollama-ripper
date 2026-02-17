import { query } from "@anthropic-ai/claude-agent-sdk";
import { config } from "../config";
import type { OllamaMessage } from "../ollama";

type OnStatus = (status: { type: string; name: string; args: string }) => void;

export const CLOUD_THINK_REGEX = /cloudthink|ultrathink|megathink|thinkmore|powerthink/gi;

function extractSystem(messages: OllamaMessage[]): string {
  return messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
}

function buildConversationPrompt(messages: OllamaMessage[]): string {
  return messages
    .filter((m) => m.role !== "system" && m.role !== "tool")
    .map((m) => {
      const content = m.content.replace(CLOUD_THINK_REGEX, "").trim();
      if (!content) return null;
      const label = m.role === "user" ? "User" : "Assistant";
      return `${label}: ${content}`;
    })
    .filter(Boolean)
    .join("\n\n");
}

function buildEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined) env[k] = v;
  }
  if (config.anthropic.apiKey) {
    env.ANTHROPIC_API_KEY = config.anthropic.apiKey;
  }
  return env;
}

export function getCurrentCloudModel(): string {
  return config.anthropic.model;
}

export async function queryCloud(
  ollamaMessages: OllamaMessage[],
  onStatus?: OnStatus
): Promise<string> {
  const systemPrompt = extractSystem(ollamaMessages);
  const prompt = buildConversationPrompt(ollamaMessages);

  let finalText = "";

  for await (const msg of query({
    prompt,
    options: {
      systemPrompt,
      allowedTools: ["WebSearch", "WebFetch", "Read", "Glob", "Grep"],
      model: config.anthropic.model,
      maxTurns: config.maxToolRounds,
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      env: buildEnv(),
    },
  })) {
    if (msg.type === "assistant") {
      const content = msg.message.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === "tool_use") {
            onStatus?.({ type: "tool", name: block.name, args: JSON.stringify(block.input) });
          }
        }
      }
    } else if (msg.type === "result") {
      if (msg.subtype === "success") {
        finalText = msg.result;
      } else {
        finalText = msg.errors?.join("\n") ?? "Cloud AI error (max turns reached).";
      }
    }
  }

  return finalText;
}
