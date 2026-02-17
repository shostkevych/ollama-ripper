import * as fs from "node:fs";
import * as path from "node:path";

export const storeDir = path.resolve(import.meta.dir, "data");
const storePath = path.join(storeDir, "config.json");
export const systemPromptPath = path.join(storeDir, "system-prompt.txt");
export const rulesPath = path.join(storeDir, "rules.txt");

export interface OllamaServer {
  name: string;
  url: string;
  vramGb?: number;
}

interface Store {
  model?: string;
  modelSizeBytes?: number;
  numCtx?: number;
  userName?: string;
  ollamaUrl?: string;
  servers?: OllamaServer[];
  activeServer?: string;
  vramGb?: number;
  tavilyApiKey?: string;
  maxToolRounds?: number;
  maxToolCalls?: number;
  exchangeRateApiKey?: string;
  disabledTools?: string[];
  setupDone?: boolean;
  anthropicApiKey?: string;
  anthropicModel?: string;
  anthropicAuthMethod?: "key" | "subscription";
  daemonUrl?: string;
}

export function loadStore(): Store {
  try {
    return JSON.parse(fs.readFileSync(storePath, "utf-8"));
  } catch {
    return {};
  }
}

export function saveStore(data: Partial<Store>): void {
  const current = loadStore();
  fs.mkdirSync(storeDir, { recursive: true });
  fs.writeFileSync(storePath, JSON.stringify({ ...current, ...data }, null, 2));
}

export function migrateStore(): void {
  const store = loadStore();
  if (store.ollamaUrl && (!store.servers || store.servers.length === 0)) {
    saveStore({
      servers: [{ name: store.ollamaUrl, url: store.ollamaUrl, vramGb: store.vramGb }],
      activeServer: store.ollamaUrl,
    });
  }
}
