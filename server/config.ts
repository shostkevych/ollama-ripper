import { loadStore, saveStore, type OllamaServer } from "./store";

const store = loadStore();

function resolveActiveServer(): OllamaServer | undefined {
  if (store.servers?.length && store.activeServer) {
    return store.servers.find((s) => s.name === store.activeServer);
  }
  return undefined;
}

const activeServer = resolveActiveServer();

export const config = {
  ollama: {
    url: process.env.OLLAMA_URL ?? activeServer?.url ?? store.ollamaUrl ?? "",
    model: store.model ?? "",
    modelSizeBytes: store.modelSizeBytes ?? 0,
    numCtx: store.numCtx ?? 32768,
    vramBytes: (activeServer?.vramGb ?? store.vramGb ?? 16) * 1024 ** 3,
  },
  tavily: {
    apiKey: store.tavilyApiKey ?? "",
  },
  anthropic: {
    apiKey: store.anthropicApiKey ?? "",
    model: store.anthropicModel ?? "claude-opus-4-6",
  },
  exchangeRateApiKey: store.exchangeRateApiKey ?? "",
  maxToolRounds: store.maxToolRounds ?? 10,
  maxToolCalls: store.maxToolCalls ?? 3,
  userName: store.userName ?? "",
  daemonUrl: process.env.RIPPER_DAEMON_URL ?? store.daemonUrl ?? "http://localhost:7474",
};

export function setModel(model: string, numCtx?: number, sizeBytes?: number): void {
  config.ollama.model = model;
  if (numCtx) config.ollama.numCtx = numCtx;
  if (sizeBytes !== undefined) config.ollama.modelSizeBytes = sizeBytes;
  saveStore({ model, numCtx: numCtx ?? config.ollama.numCtx, modelSizeBytes: sizeBytes ?? config.ollama.modelSizeBytes });
}

export function setUserName(name: string): void {
  config.userName = name;
  saveStore({ userName: name });
}

export function setOllamaUrl(url: string): void {
  addServer(url, url);
}

export function addServer(name: string, url: string, vramGb?: number): void {
  const current = loadStore();
  const servers = current.servers ?? [];
  const existing = servers.findIndex((s) => s.name === name);
  const entry: OllamaServer = { name, url, vramGb };
  if (existing >= 0) {
    servers[existing] = entry;
  } else {
    servers.push(entry);
  }
  config.ollama.url = url;
  if (vramGb) config.ollama.vramBytes = vramGb * 1024 ** 3;
  saveStore({ servers, activeServer: name, ollamaUrl: url });
}

export function switchServer(name: string): void {
  const current = loadStore();
  const server = current.servers?.find((s) => s.name === name);
  if (!server) return;
  config.ollama.url = server.url;
  if (server.vramGb) config.ollama.vramBytes = server.vramGb * 1024 ** 3;
  saveStore({ activeServer: name, ollamaUrl: server.url });
}

export function getServers(): OllamaServer[] {
  return loadStore().servers ?? [];
}

export function getActiveServerName(): string {
  return loadStore().activeServer ?? "";
}

export function setVramGb(gb: number): void {
  config.ollama.vramBytes = gb * 1024 ** 3;
  const current = loadStore();
  const servers = current.servers ?? [];
  const active = servers.findIndex((s) => s.name === current.activeServer);
  if (active >= 0) {
    servers[active] = { ...servers[active], vramGb: gb };
    saveStore({ vramGb: gb, servers });
  } else {
    saveStore({ vramGb: gb });
  }
}

export function setExchangeRateApiKey(key: string): void {
  config.exchangeRateApiKey = key;
  saveStore({ exchangeRateApiKey: key });
}

export function setTavilyKey(key: string): void {
  config.tavily.apiKey = key;
  saveStore({ tavilyApiKey: key });
}

export function setAnthropicKey(key: string): void {
  config.anthropic.apiKey = key;
  saveStore({ anthropicApiKey: key });
}

export function setAnthropicModel(model: string): void {
  config.anthropic.model = model;
  saveStore({ anthropicModel: model });
}

export function setDaemonUrl(url: string): void {
  config.daemonUrl = url;
  saveStore({ daemonUrl: url });
}

export function setSetupDone(): void {
  saveStore({ setupDone: true });
}

export function onboardingStep(): 0 | 1 | 2 | 3 | 4 | 5 | 6 | 9 {
  if (!store.daemonUrl) return 9;
  if (!config.userName) return 1;
  if (!config.ollama.url) return 2;
  if (!config.ollama.model) return 3;
  if (!(activeServer?.vramGb ?? store.vramGb)) return 4;
  if (!config.tavily.apiKey) return 5;
  if (!store.setupDone) return 6;
  return 0;
}
