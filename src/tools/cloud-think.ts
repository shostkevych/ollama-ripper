import { config } from "../config";
import type { OllamaMessage, OllamaTool } from "../ollama";
import { getAllToolSpecs, executeTool } from "./registry";

type OnStatus = (status: { type: string; name: string; args: string }) => void;

export const CLOUD_THINK_REGEX = /cloudthink|ultrathink|megathink|thinkmore|powerthink/gi;

interface OpenAIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
}

interface OpenAIToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface OpenAIResponse {
  choices: {
    message: {
      role: "assistant";
      content: string | null;
      tool_calls?: OpenAIToolCall[];
    };
    finish_reason: string;
  }[];
}

function toOpenAIMessages(messages: OllamaMessage[]): OpenAIMessage[] {
  return messages
    .filter((m) => m.role !== "tool")
    .map((m) => ({
      role: (m.role === "system" ? "system" : m.role === "user" ? "user" : "assistant") as OpenAIMessage["role"],
      content: m.content.replace(CLOUD_THINK_REGEX, "").trim(),
    }))
    .filter((m) => (m.content?.length ?? 0) > 0);
}

async function callOpenAI(messages: OpenAIMessage[], tools?: OllamaTool[]): Promise<OpenAIResponse> {
  const body: Record<string, unknown> = {
    model: config.openai.model,
    messages,
    temperature: 0.6,
    top_p: 0.9,
    frequency_penalty: 0.2,
  };

  if (tools?.length) {
    body.tools = tools;
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.openai.apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI API error (${res.status}): ${text}`);
  }

  return res.json() as Promise<OpenAIResponse>;
}

export async function queryOpenAI(
  ollamaMessages: OllamaMessage[],
  onStatus?: OnStatus
): Promise<string> {
  if (!config.openai.apiKey) {
    throw new Error("OPENAI_API_KEY is not set in environment variables.");
  }

  const messages = toOpenAIMessages(ollamaMessages);
  const tools = getAllToolSpecs();
  let rounds = 0;

  while (rounds < config.maxToolRounds) {
    const response = await callOpenAI(messages, tools);
    const choice = response.choices[0];
    if (!choice) return "No response from OpenAI.";

    const { message } = choice;

    // No tool calls — return the text response
    if (!message.tool_calls?.length) {
      return message.content ?? "";
    }

    // Append assistant message with tool calls
    messages.push({
      role: "assistant",
      content: message.content,
      tool_calls: message.tool_calls,
    });

    // Execute each tool call
    for (const tc of message.tool_calls) {
      const { name, arguments: argsStr } = tc.function;
      let args: Record<string, unknown>;
      try {
        args = JSON.parse(argsStr);
      } catch {
        args = {};
      }

      const displayArgs = Object.values(args).join(", ");
      onStatus?.({ type: "tool", name, args: displayArgs });

      const result = await executeTool(name, args);
      onStatus?.({ type: "tool_done", name, args: displayArgs });

      messages.push({
        role: "tool",
        content: result,
        tool_call_id: tc.id,
      });
    }

    rounds++;
  }

  // Max rounds — one final call without tools
  const final = await callOpenAI(messages);
  return final.choices[0]?.message?.content ?? "";
}
