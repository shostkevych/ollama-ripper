import {
  config,
  setModel,
  setUserName,
  setOllamaUrl,
  setTavilyKey,
  setExchangeRateApiKey,
  setAnthropicKey,
  setAnthropicModel,
  setDaemonUrl,
  setSetupDone,
  setVramGb,
  addServer,
  switchServer,
  getServers,
  getActiveServerName,
} from "../config";
import { json, parseJSON, type RouteHandler } from "../middleware";

export const getConfig: RouteHandler = () => {
  return json({
    ollama: config.ollama,
    tavily: { apiKey: config.tavily.apiKey ? "***" : "" },
    anthropic: { apiKey: config.anthropic.apiKey ? "***" : "", model: config.anthropic.model },
    exchangeRateApiKey: config.exchangeRateApiKey ? "***" : "",
    maxToolRounds: config.maxToolRounds,
    maxToolCalls: config.maxToolCalls,
    userName: config.userName,
    servers: getServers(),
    activeServer: getActiveServerName(),
  });
};

export const putConfig: RouteHandler = async (req) => {
  const body = await parseJSON<Record<string, unknown>>(req);
  if (!body) return json({ error: "Invalid JSON" }, 400);

  if (typeof body.userName === "string") setUserName(body.userName);
  if (typeof body.ollamaUrl === "string") setOllamaUrl(body.ollamaUrl);
  if (typeof body.tavilyApiKey === "string") setTavilyKey(body.tavilyApiKey);
  if (typeof body.exchangeRateApiKey === "string") setExchangeRateApiKey(body.exchangeRateApiKey);
  if (typeof body.anthropicApiKey === "string") setAnthropicKey(body.anthropicApiKey);
  if (typeof body.anthropicModel === "string") setAnthropicModel(body.anthropicModel);
  if (typeof body.daemonUrl === "string") setDaemonUrl(body.daemonUrl);
  if (typeof body.vramGb === "number") setVramGb(body.vramGb);

  return json({ ok: true });
};
