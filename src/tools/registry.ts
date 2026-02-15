import type { OllamaTool } from "../ollama";

export interface ToolDefinition {
  spec: OllamaTool;
  execute: (args: Record<string, unknown>) => Promise<string>;
}

const tools = new Map<string, ToolDefinition>();

export function registerTool(def: ToolDefinition): void {
  tools.set(def.spec.function.name, def);
}

export function getAllToolSpecs(): OllamaTool[] {
  return Array.from(tools.values(), (t) => t.spec);
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  const tool = tools.get(name);
  if (!tool) return `Error: unknown tool "${name}"`;

  try {
    return await tool.execute(args);
  } catch (err) {
    return `Error executing ${name}: ${err instanceof Error ? err.message : String(err)}`;
  }
}
