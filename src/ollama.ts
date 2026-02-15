import { config } from "./config";

export interface OllamaMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: OllamaToolCall[];
}

export interface OllamaToolCall {
  function: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

export interface OllamaTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

interface OllamaChatRequest {
  model: string;
  messages: OllamaMessage[];
  tools?: OllamaTool[];
  stream: boolean;
  keep_alive?: string | number;
  options?: { num_ctx?: number; num_keep?: number };
}

export interface OllamaChatResponse {
  message: OllamaMessage;
  done: boolean;
  prompt_eval_count?: number;
  eval_count?: number;
}

interface OllamaModelEntry {
  name: string;
  size: number;
}

let cachedModels: OllamaModelEntry[] | null = null;

export async function listModels(): Promise<string[]> {
  const res = await fetch(`${config.ollama.url}/api/tags`);
  if (!res.ok) {
    throw new Error(`Ollama error ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as { models: OllamaModelEntry[] };
  cachedModels = data.models;
  return data.models.map((m) => m.name);
}

function getModelSizeFromCache(model: string): number {
  return cachedModels?.find((m) => m.name === model)?.size ?? 0;
}

export interface ModelInfo {
  sizeBytes: number;
  numCtx: number;
  warning?: string;
}

/**
 * Fetch model details and compute the max context that fits in VRAM.
 *
 * KV-cache per token (fp16) = 2 (K+V) × layers × kv_heads × head_dim × 2 bytes
 * Available VRAM         = total VRAM − model weight size (with 10% overhead buffer)
 * Max context            = available / kv_bytes_per_token, capped at model's native limit
 */
export async function getModelInfo(model: string): Promise<ModelInfo | null> {
  const res = await fetch(`${config.ollama.url}/api/show`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model }),
  });
  if (!res.ok) return null;

  const data = (await res.json()) as { model_info?: Record<string, unknown> };
  const info = data.model_info;
  if (!info) return null;

  // Extract architecture-prefixed fields (e.g. qwen2.block_count, llama.block_count)
  const find = (suffix: string): number | null => {
    for (const [k, v] of Object.entries(info)) {
      if (k.endsWith(suffix) && typeof v === "number") return v;
    }
    return null;
  };

  const layers = find(".block_count");
  const kvHeads = find(".attention.head_count_kv");
  const heads = find(".attention.head_count");
  const embedDim = find(".embedding_length");
  const nativeCtx = find(".context_length");
  const modelSize = getModelSizeFromCache(model);

  if (!layers || !kvHeads || !heads || !embedDim || !modelSize) {
    const fallback = nativeCtx ?? 32768;
    return { sizeBytes: modelSize, numCtx: fallback };
  }

  const headDim = embedDim / heads;
  // KV cache (fp16): 2 (K+V) × layers × kv_heads × head_dim × 2 bytes
  const kvBytesPerToken = 2 * layers * kvHeads * headDim * 2;
  // Actual per-token VRAM is ~1.75× KV cache due to attention/compute buffers
  const vramBytesPerToken = Math.ceil(kvBytesPerToken * 1.75);

  // Fixed 500MB overhead for GPU allocator headroom
  const gpuOverhead = 500 * 1024 ** 2;
  const available = config.ollama.vramBytes - modelSize - gpuOverhead;

  if (available <= 0) {
    const vramGb = (config.ollama.vramBytes / 1024 ** 3).toFixed(0);
    const needGb = ((modelSize + gpuOverhead) / 1024 ** 3).toFixed(1);
    return {
      sizeBytes: modelSize,
      numCtx: 2048,
      warning: `Model needs ~${needGb} GB but only ${vramGb} GB VRAM available — may fail to load`,
    };
  }

  // Round down to nearest 1024, cap at native context length
  let maxCtx = Math.floor(available / vramBytesPerToken / 1024) * 1024;
  if (nativeCtx) maxCtx = Math.min(maxCtx, nativeCtx);
  maxCtx = Math.max(maxCtx, 2048);

  return { sizeBytes: modelSize, numCtx: maxCtx };
}

export async function chat(
  messages: OllamaMessage[],
  tools?: OllamaTool[]
): Promise<OllamaChatResponse> {
  const body: OllamaChatRequest = {
    model: config.ollama.model,
    messages,
    stream: false,
    keep_alive: -1,
    options: { num_ctx: config.ollama.numCtx, num_keep: -1 },
  };
  if (tools?.length) body.tools = tools;

  const res = await fetch(`${config.ollama.url}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Ollama error ${res.status}: ${await res.text()}`);
  }

  return res.json() as Promise<OllamaChatResponse>;
}

export interface ChatStreamResult {
  content: string;
  toolCalls?: OllamaToolCall[];
  promptEvalCount?: number;
  evalCount?: number;
}

export async function chatStreamWithTools(
  messages: OllamaMessage[],
  tools?: OllamaTool[],
  onToken?: (token: string) => void
): Promise<ChatStreamResult> {
  const body: OllamaChatRequest = {
    model: config.ollama.model,
    messages,
    stream: true,
    keep_alive: -1,
    options: { num_ctx: config.ollama.numCtx, num_keep: -1 },
  };
  if (tools?.length) body.tools = tools;

  const res = await fetch(`${config.ollama.url}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Ollama error ${res.status}: ${await res.text()}`);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let toolCalls: OllamaToolCall[] | undefined;
  let promptEvalCount: number | undefined;
  let evalCount: number | undefined;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop()!;

    for (const line of lines) {
      if (!line.trim()) continue;
      const chunk = JSON.parse(line) as OllamaChatResponse;
      if (chunk.message?.content) {
        content += chunk.message.content;
        onToken?.(chunk.message.content);
      }
      if (chunk.message?.tool_calls?.length) {
        toolCalls = chunk.message.tool_calls;
      }
      if (chunk.done) {
        promptEvalCount = chunk.prompt_eval_count;
        evalCount = chunk.eval_count;
      }
    }
  }

  if (buffer.trim()) {
    const chunk = JSON.parse(buffer) as OllamaChatResponse;
    if (chunk.message?.content) {
      content += chunk.message.content;
      onToken?.(chunk.message.content);
    }
    if (chunk.message?.tool_calls?.length) {
      toolCalls = chunk.message.tool_calls;
    }
    if (chunk.done) {
      promptEvalCount = chunk.prompt_eval_count;
      evalCount = chunk.eval_count;
    }
  }

  return { content, toolCalls, promptEvalCount, evalCount };
}
