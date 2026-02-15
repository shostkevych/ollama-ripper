import * as fs from "node:fs";
import * as path from "node:path";

export const storeDir = path.join(process.env.HOME ?? "", ".localai");
const storePath = path.join(storeDir, "config.json");
export const systemPromptPath = path.join(storeDir, "system-prompt.txt");
export const rulesPath = path.join(storeDir, "rules.txt");

interface Store {
  model?: string;
  numCtx?: number;
  userName?: string;
  openaiApiKey?: string;
  openaiModel?: string;
  ollamaUrl?: string;
  vramGb?: number;
  tavilyApiKey?: string;
  maxToolRounds?: number;
  maxToolCalls?: number;
  obsidianVault?: string;
  exchangeRateApiKey?: string;
  setupDone?: boolean;
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
