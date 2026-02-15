import { spawn, type ChildProcess } from "node:child_process";
import * as path from "node:path";
import { registerTool } from "./tools/registry";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: number;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
}

interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

let proc: ChildProcess | null = null;
let nextId = 1;
let buffer = "";
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

function send(msg: JsonRpcRequest): void {
  proc!.stdin!.write(JSON.stringify(msg) + "\n");
}

function request(method: string, params?: unknown): Promise<unknown> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    send({ jsonrpc: "2.0", id, method, params });
  });
}

function notify(method: string, params?: unknown): void {
  send({ jsonrpc: "2.0", method, params });
}

function handleData(data: string): void {
  buffer += data;

  while (true) {
    const nlIndex = buffer.indexOf("\n");
    if (nlIndex === -1) break;

    const line = buffer.slice(0, nlIndex).trim();
    buffer = buffer.slice(nlIndex + 1);

    if (!line) continue;

    try {
      const msg = JSON.parse(line) as JsonRpcResponse;
      if (msg.id != null && pending.has(msg.id)) {
        const p = pending.get(msg.id)!;
        pending.delete(msg.id);
        if (msg.error) {
          p.reject(new Error(msg.error.message));
        } else {
          p.resolve(msg.result);
        }
      }
    } catch {
      // ignore parse errors
    }
  }
}

const binPath = path.resolve(import.meta.dir, "../node_modules/.bin/mcp-obsidian");

export async function initMcp(vaultPath: string): Promise<void> {
  proc = spawn(binPath, [vaultPath], {
    stdio: ["pipe", "pipe", "pipe"],
  });

  proc.stdout!.setEncoding("utf-8");
  proc.stdout!.on("data", handleData);
  proc.stderr!.on("data", () => {});

  // Initialize handshake
  await request("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "ollama-ripper", version: "0.1.0" },
  });
  notify("notifications/initialized");

  // List and register tools
  const res = (await request("tools/list")) as { tools: McpTool[] };

  for (const tool of res.tools) {
    const toolName = `obsidian_${tool.name}`;
    registerTool({
      spec: {
        type: "function",
        function: {
          name: toolName,
          description: `[Obsidian] ${tool.description}`,
          parameters: {
            type: "object",
            properties: tool.inputSchema.properties,
            required: tool.inputSchema.required,
          },
        },
      },
      async execute(args) {
        const result = (await request("tools/call", {
          name: tool.name,
          arguments: args,
        })) as { content: { type: string; text: string }[] };

        return result.content.map((c) => c.text).join("\n");
      },
    });
  }

  // silent: connection logged only in debug
}
