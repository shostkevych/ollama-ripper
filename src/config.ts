import { loadStore, saveStore } from "./store";

const store = loadStore();

export const config = {
  ollama: {
    url: store.ollamaUrl ?? "",
    model: store.model ?? "",
    numCtx: store.numCtx ?? 32768,
    vramBytes: (store.vramGb ?? 16) * 1024 ** 3,
  },
  tavily: {
    apiKey: store.tavilyApiKey ?? "",
  },
  openai: {
    apiKey: store.openaiApiKey ?? "",
    model: store.openaiModel ?? "gpt-5.2",
  },
  exchangeRateApiKey: store.exchangeRateApiKey ?? "",
  maxToolRounds: store.maxToolRounds ?? 10,
  maxToolCalls: store.maxToolCalls ?? 3,
  obsidianVault: store.obsidianVault ?? `${process.env.HOME}/Documents/Obsidian/shostkevych`,
  userName: store.userName ?? "",
};

export function setModel(model: string, numCtx?: number): void {
  config.ollama.model = model;
  if (numCtx) config.ollama.numCtx = numCtx;
  saveStore({ model, numCtx: numCtx ?? config.ollama.numCtx });
}

export function setUserName(name: string): void {
  config.userName = name;
  saveStore({ userName: name });
}

export function setOpenAiKey(key: string): void {
  config.openai.apiKey = key;
  saveStore({ openaiApiKey: key });
}

export function setOllamaUrl(url: string): void {
  config.ollama.url = url;
  saveStore({ ollamaUrl: url });
}

export function setVramGb(gb: number): void {
  config.ollama.vramBytes = gb * 1024 ** 3;
  saveStore({ vramGb: gb });
}

export function setExchangeRateApiKey(key: string): void {
  config.exchangeRateApiKey = key;
  saveStore({ exchangeRateApiKey: key });
}

export function setTavilyKey(key: string): void {
  config.tavily.apiKey = key;
  saveStore({ tavilyApiKey: key });
}

export function setOpenAiModel(model: string): void {
  config.openai.model = model;
  saveStore({ openaiModel: model });
}

export function setSetupDone(): void {
  saveStore({ setupDone: true });
}

export function onboardingStep(): 0 | 1 | 2 | 3 | 4 | 5 | 6 {
  if (!config.userName) return 1;
  if (!config.ollama.url) return 2;
  if (!config.ollama.model) return 3;
  if (!store.vramGb) return 4;
  if (!config.tavily.apiKey) return 5;
  if (!store.setupDone) return 6;
  return 0;
}
