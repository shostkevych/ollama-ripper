import {
  config,
  onboardingStep,
  setUserName,
  addServer,
  setModel,
  setVramGb,
  setTavilyKey,
  setExchangeRateApiKey,
  setDaemonUrl,
  setAnthropicKey,
  setAnthropicModel,
  setSetupDone,
  getActiveServerName,
} from "../config";
import { saveStore } from "../store";
import { listModels, getModelInfo } from "../ollama";
import { getAllToolNames, getToolDescription, isToolEnabled, setDisabledTools } from "../tools/registry";
import { json, parseJSON, type RouteHandler } from "../middleware";

export const getSetupStatus: RouteHandler = () => {
  return json({
    step: onboardingStep(),
    config: {
      userName: config.userName,
      ollamaUrl: config.ollama.url,
      model: config.ollama.model,
      activeServer: getActiveServerName(),
    },
  });
};

export const postSetupStep: RouteHandler = async (req) => {
  const body = await parseJSON<{ step: number; value: unknown }>(req);
  if (!body || body.step == null) return json({ error: "step is required" }, 400);

  const { step, value } = body;
  const v = typeof value === "string" ? value.trim() : "";

  switch (step) {
    case 1:
      if (!v) return json({ error: "Name is required" }, 400);
      setUserName(v);
      return json({ nextStep: 2, message: `Name: ${v}` });
    case 2:
      if (!v) return json({ error: "URL is required" }, 400);
      return json({ nextStep: 25, message: `Ollama URL: ${v}`, ollamaUrl: v });
    case 25: {
      const urlVal = typeof (body.value as any)?.url === "string" ? (body.value as any).url : "";
      const name = v || urlVal;
      return json({ nextStep: 26, message: `Server name: ${name}`, serverName: name });
    }
    case 26: {
      const serverName = typeof (body.value as any)?.serverName === "string" ? (body.value as any).serverName : "";
      const url = typeof (body.value as any)?.url === "string" ? (body.value as any).url : "";
      const gb = Number(v) > 0 ? Number(v) : undefined;
      addServer(serverName, url, gb);
      return json({ nextStep: 3, message: `Server added: ${serverName}` });
    }
    case 3: {
      if (!v) return json({ error: "Model is required" }, 400);
      const info = await getModelInfo(v);
      const numCtx = info?.numCtx ?? config.ollama.numCtx;
      setModel(v, numCtx, info?.sizeBytes);
      return json({ nextStep: 5, message: `Model: ${v}`, warning: info?.warning });
    }
    case 4: {
      const gb = Number(v);
      if (gb > 0) setVramGb(gb);
      return json({ nextStep: 5, message: `VRAM: ${v || "default"}` });
    }
    case 5:
      if (v) setTavilyKey(v);
      return json({ nextStep: 6, message: `Tavily: ${v ? "configured" : "skipped"}` });
    case 6:
      if (v) setExchangeRateApiKey(v);
      return json({ nextStep: 7, message: `Exchange Rate: ${v ? "configured" : "skipped"}` });
    case 9: {
      const url = v || "http://localhost:7474";
      setDaemonUrl(url);
      return json({ nextStep: 1, message: `Daemon: ${url}` });
    }
    case 7: {
      // Tool toggle step — value is { disabled: string[] }
      const disabled = Array.isArray((body.value as any)?.disabled) ? (body.value as any).disabled : [];
      setDisabledTools(disabled);
      return json({ nextStep: 8, message: "Tools configured" });
    }
    case 8: {
      // Ultrathink y/n
      if (v === "y" || v === "Y") {
        return json({ nextStep: 10, message: "Ultrathink: enabled" });
      }
      setSetupDone();
      return json({ nextStep: 0, message: "Setup complete" });
    }
    case 10: {
      // Auth method choice: API key or Subscription
      if (v === "key" || v === "a" || v === "A") {
        return json({ nextStep: 12 });
      }
      if (v === "sub" || v === "s" || v === "S") {
        const { spawnSync } = await import("node:child_process");
        const env = { ...process.env } as Record<string, string>;
        delete env.CLAUDECODE;
        const result = spawnSync("claude", ["setup-token"], { stdio: "inherit", env });
        if (result.status === 0) {
          saveStore({ anthropicAuthMethod: "subscription" });
          return json({ nextStep: 13 });
        }
        return json({ error: "Authentication failed" }, 500);
      }
      return json({ error: "Invalid choice" }, 400);
    }
    case 12:
      if (v) setAnthropicKey(v);
      return json({ nextStep: 13, message: `Anthropic key: ${v ? "configured" : "skipped"}` });
    case 13: {
      const model = v || "claude-sonnet-4-5-20250929";
      setAnthropicModel(model);
      setSetupDone();
      return json({ nextStep: 0, message: `Claude model: ${model}` });
    }
    default:
      return json({ error: `Unknown step: ${step}` }, 400);
  }
};

export const getSetupModels: RouteHandler = async () => {
  try {
    const models = await listModels();
    return json(models);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 502);
  }
};

export const getSetupTools: RouteHandler = () => {
  const names = getAllToolNames();
  return json(
    names.map((name) => ({
      name,
      description: getToolDescription(name),
      enabled: isToolEnabled(name),
    }))
  );
};
