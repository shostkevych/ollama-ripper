import * as fs from "node:fs";
import * as path from "node:path";

const clientDir = path.join(process.env.HOME ?? "", ".ollama-ripper");
const clientPath = path.join(clientDir, "client.json");

interface ClientConfig {
  serverUrl: string;
  token: string;
}

let cached: ClientConfig | null = null;

export function loadClientConfig(): ClientConfig {
  if (cached) return cached;
  try {
    cached = JSON.parse(fs.readFileSync(clientPath, "utf-8"));
    return cached!;
  } catch {
    cached = { serverUrl: "http://localhost:7474", token: "" };
    return cached;
  }
}

export function saveClientConfig(data: Partial<ClientConfig>): void {
  const current = loadClientConfig();
  const updated = { ...current, ...data };
  fs.mkdirSync(clientDir, { recursive: true });
  fs.writeFileSync(clientPath, JSON.stringify(updated, null, 2));
  cached = updated;
}

export function getServerUrl(): string {
  return loadClientConfig().serverUrl;
}

export function getToken(): string {
  return loadClientConfig().token;
}

export function clearToken(): void {
  saveClientConfig({ token: "" });
}
