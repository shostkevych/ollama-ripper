import { getServerUrl, getToken } from "./store";

function headers(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

function url(path: string): string {
  return `${getServerUrl()}${path}`;
}

async function request<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(url(path), {
    method,
    headers: headers(),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) throw new AuthError();
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` })) as { error?: string };
    throw new Error(data.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export class AuthError extends Error {
  constructor() { super("Unauthorized"); }
}

// Health
export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(url("/health"), { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

// Auth
export async function requestPairing(): Promise<{ status: string; message: string }> {
  return request("POST", "/auth/pair");
}

export async function verifyPairing(code: string): Promise<{ token: string }> {
  const res = await fetch(url("/auth/verify"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error ?? "Verification failed");
  }
  return res.json() as Promise<{ token: string }>;
}

// Config
export async function getConfig(): Promise<Record<string, unknown>> {
  return request("GET", "/config");
}

export async function putConfig(data: Record<string, unknown>): Promise<void> {
  await request("PUT", "/config", data);
}

// Models
export async function getModels(): Promise<{ name: string; size: number }[]> {
  return request("GET", "/models");
}

export async function switchModel(model: string): Promise<{ model: string; numCtx: number; sizeBytes: number; warning?: string }> {
  return request("POST", "/models/switch", { model });
}

export async function getModelStatus(): Promise<{ currentModel: string; numCtx: number; running: string[] }> {
  return request("GET", "/models/status");
}

// Chat (SSE — returns raw Response for streaming)
export function postChat(message: string, cloudMode?: boolean): Response | Promise<Response> {
  return fetch(url("/chat"), {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ message, cloudMode }),
  });
}

export async function postChatNew(): Promise<void> {
  await request("POST", "/chat/new");
}

export async function postChatCompact(): Promise<{ systemMessage?: string; errorMessage?: string }> {
  return request("POST", "/chat/compact");
}

export async function postChatSave(): Promise<{ systemMessage?: string; errorMessage?: string }> {
  return request("POST", "/chat/save");
}

export async function postChatAnswer(id: string, answer: string): Promise<void> {
  await request("POST", "/chat/answer", { id, answer });
}

// Conversations
export async function getConversations(): Promise<{ id: number; title: string; summary: string; model: string; created_at: string }[]> {
  return request("GET", "/conversations");
}

export async function resumeConversation(id: number): Promise<void> {
  await request("POST", `/conversations/${id}/resume`);
}

// Interview (SSE)
export function postInterview(topic: string): Response | Promise<Response> {
  return fetch(url("/interview"), {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ topic }),
  });
}

export async function stopInterview(score: boolean): Promise<void> {
  await request("DELETE", `/interview?score=${score}`);
}

// Schedules
export async function getSchedules(): Promise<unknown[]> {
  return request("GET", "/schedules");
}

export async function addSchedule(prompt: string, expr: string): Promise<unknown> {
  return request("POST", "/schedules", { prompt, expr });
}

export async function removeSchedule(id: number): Promise<void> {
  await request("DELETE", `/schedules/${id}`);
}

export async function patchSchedule(id: number, enabled: boolean): Promise<void> {
  await request("PATCH", `/schedules/${id}`, { enabled });
}

// Cloud
export async function setCloudModel(model: string): Promise<void> {
  await request("PUT", "/cloud/model", { model });
}

export async function setCloudKey(key: string): Promise<void> {
  await request("PUT", "/cloud/key", { key });
}

// Tools
export async function getTools(): Promise<{ name: string; description: string; enabled: boolean }[]> {
  return request("GET", "/tools");
}

export async function toggleTool(name: string, enabled: boolean): Promise<void> {
  await request("PUT", `/tools/${name}/toggle`, { enabled });
}

export async function createCustomTool(name: string, code: string): Promise<void> {
  await request("POST", "/tools/custom", { name, code });
}

// Servers
export async function getServers(): Promise<{ servers: { name: string; url: string; vramGb?: number }[]; activeServer: string }> {
  return request("GET", "/servers");
}

export async function addServer(name: string, serverUrl: string, vramGb?: number): Promise<void> {
  await request("POST", "/servers", { name, url: serverUrl, vramGb });
}

export async function activateServer(name: string): Promise<void> {
  await request("PUT", `/servers/${name}/activate`);
}

export async function setVram(gb: number): Promise<void> {
  await request("PUT", "/vram", { gb });
}

// Setup
export async function getSetupStatus(): Promise<{ step: number; config: Record<string, unknown> }> {
  return request("GET", "/setup/status");
}

export async function postSetupStep(step: number, value: unknown): Promise<{ nextStep: number; message: string }> {
  return request("POST", "/setup/step", { step, value });
}

export async function getSetupModels(): Promise<{ name: string; size: number }[]> {
  return request("GET", "/setup/models");
}

export async function getSetupTools(): Promise<{ name: string; description: string; enabled: boolean }[]> {
  return request("GET", "/setup/tools");
}
