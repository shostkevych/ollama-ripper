import * as fs from "node:fs";
import * as crypto from "node:crypto";
import { runAgent, type AgentStatus } from "../agent";
import { config } from "../config";
import { optimizeContext } from "../context";
import { handleSaveCommand, handleCompactCommand, handleNewCommand } from "../commands";
import { CLOUD_THINK_REGEX, getCurrentCloudModel } from "../tools/cloud-think";
import { setAskUserCallback, clearAskUserCallback } from "../tools/ask-user";
import { storeDir, systemPromptPath, rulesPath } from "../store";
import type { OllamaMessage } from "../ollama";
import { timestamp } from "../utils";
import { json, parseJSON, extractToken, type RouteHandler } from "../middleware";
import { getOrCreateSession } from "../session";
import { createSSEResponse } from "../sse";
import { log } from "../log";

import * as path from "node:path";
const defaultPromptPath = path.resolve(import.meta.dir, "../system-prompt.txt");

function getSystemPrompt(): OllamaMessage {
  fs.mkdirSync(storeDir, { recursive: true });
  if (!fs.existsSync(systemPromptPath)) {
    fs.copyFileSync(defaultPromptPath, systemPromptPath);
  }
  let content = fs.readFileSync(systemPromptPath, "utf-8");
  if (fs.existsSync(rulesPath)) {
    content += "\n\n## User Rules\n" + fs.readFileSync(rulesPath, "utf-8");
  }
  return { role: "system", content };
}

export const postChat: RouteHandler = async (req) => {
  const token = extractToken(req)!;
  const session = getOrCreateSession(token);

  if (session.activeSSE) {
    log.warn("chat", `concurrent stream rejected for ${token.slice(0, 8)}...`);
    return json({ error: "Concurrent stream not allowed" }, 409);
  }

  const body = await parseJSON<{ message?: string; cloudMode?: boolean }>(req);
  if (!body?.message) return json({ error: "message is required" }, 400);

  log.info("chat", `prompt: "${body.message.slice(0, 120)}${body.message.length > 120 ? "..." : ""}"`);

  const cloudMode = body.cloudMode ?? false;
  const { response, writer } = createSSEResponse();
  session.activeSSE = writer;

  // Run agent in background (don't await — SSE streams)
  (async () => {
    const pingInterval = setInterval(() => writer.send("ping", {}), 5_000);

    try {
      const userMsg: OllamaMessage = {
        role: "user",
        content: `[${timestamp()}] ${body.message}`,
      };
      session.agentMsgs.push(userMsg);
      const sysPrompt = getSystemPrompt();
      log.info("chat", `system prompt: ${sysPrompt.content.length} chars`);
      log.info("chat", `history: ${session.agentMsgs.length} msgs, ${session.tokenCount} tokens`);
      const fullMsgs: OllamaMessage[] = [sysPrompt, ...session.agentMsgs];

      // Wire up ask_user to SSE
      setAskUserCallback((question, options) => {
        const id = crypto.randomUUID();
        writer.send("ask_user", { id, question, options });
        return new Promise<string>((resolve, reject) => {
          const timer = setTimeout(() => {
            session.askPending.delete(id);
            reject(new Error("ask_user timeout"));
          }, 60_000);
          session.askPending.set(id, { resolve, reject, timer });
        });
      });

      const reply = await runAgent(fullMsgs, (s: AgentStatus) => {
        switch (s.type) {
          case "thinking":
            writer.send("thinking", {});
            break;
          case "stream":
            writer.send("token", { text: s.token });
            break;
          case "tool":
            writer.send("tool_start", { name: s.name, args: s.args });
            break;
          case "tool_done":
            writer.send("tool_done", { name: s.name, args: s.args });
            break;
          case "tokens":
            session.tokenCount = s.prompt + s.completion;
            writer.send("tokens", { prompt: s.prompt, completion: s.completion });
            break;
        }
      }, { cloudMode });

      // Sync agent messages
      session.agentMsgs = fullMsgs.slice(1);
      session.agentMsgs.push({ role: "assistant", content: reply });

      // Auto-optimize context
      const { messages: optimized } = await optimizeContext(session.agentMsgs, session.tokenCount);
      session.agentMsgs = optimized;

      const model = cloudMode ? getCurrentCloudModel() : config.ollama.model;
      log.info("chat", `reply: ${reply.length} chars via ${model}`);
      writer.send("done", { content: reply, model });
    } catch (err) {
      log.error("chat", `error: ${err instanceof Error ? err.message : String(err)}`);
      writer.send("error", { message: err instanceof Error ? err.message : String(err) });
    } finally {
      clearAskUserCallback();
      clearInterval(pingInterval);
      session.activeSSE = null;
      writer.close();
    }
  })();

  return response;
};

export const postChatNew: RouteHandler = (req) => {
  const token = extractToken(req)!;
  const session = getOrCreateSession(token);
  handleNewCommand(session.agentMsgs);
  session.tokenCount = 0;
  return json({ ok: true, message: "Conversation cleared." });
};

export const postChatCompact: RouteHandler = async (req) => {
  const token = extractToken(req)!;
  const session = getOrCreateSession(token);
  const { messages, result } = await handleCompactCommand(session.agentMsgs);
  session.agentMsgs = messages;
  return json({ ok: true, ...result });
};

export const postChatSave: RouteHandler = async (req) => {
  const token = extractToken(req)!;
  const session = getOrCreateSession(token);
  try {
    const result = await handleSaveCommand(session.agentMsgs);
    return json({ ok: true, ...result });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
};

export const postChatAnswer: RouteHandler = async (req) => {
  const token = extractToken(req)!;
  const session = getOrCreateSession(token);
  const body = await parseJSON<{ id?: string; answer?: string }>(req);
  if (!body?.id || !body?.answer) return json({ error: "id and answer are required" }, 400);

  const pending = session.askPending.get(body.id);
  if (!pending) return json({ error: "No pending question with this id" }, 404);

  clearTimeout(pending.timer);
  session.askPending.delete(body.id);
  pending.resolve(body.answer);
  return json({ ok: true });
};
