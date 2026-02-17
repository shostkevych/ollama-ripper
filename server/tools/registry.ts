import type { OllamaTool } from "../ollama";
import { loadStore, saveStore } from "../store";
import { log } from "../log";

export interface ToolDefinition {
  spec: OllamaTool;
  execute: (args: Record<string, unknown>) => Promise<string>;
}

const tools = new Map<string, ToolDefinition>();
let disabledTools = new Set<string>(loadStore().disabledTools ?? []);

export function registerTool(def: ToolDefinition): void {
  tools.set(def.spec.function.name, def);
}

export function getAllToolSpecs(): OllamaTool[] {
  return Array.from(tools.values())
    .filter((t) => !disabledTools.has(t.spec.function.name))
    .map((t) => t.spec);
}

export function getAllToolNames(): string[] {
  return Array.from(tools.keys());
}

export function getToolDescription(name: string): string {
  return tools.get(name)?.spec.function.description ?? "";
}

export function isToolEnabled(name: string): boolean {
  return !disabledTools.has(name);
}

export function setDisabledTools(names: string[]): void {
  disabledTools = new Set(names);
  saveStore({ disabledTools: names });
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  const tool = tools.get(name);
  if (!tool) {
    log.warn("tools", `unknown tool "${name}"`);
    return `Error: unknown tool "${name}"`;
  }

  try {
    const t0 = Date.now();
    const result = await tool.execute(args);
    log.info("tools", `${name} executed in ${Date.now() - t0}ms (${result.length} chars)`);
    return result;
  } catch (err) {
    log.error("tools", `${name} failed: ${err instanceof Error ? err.message : String(err)}`);
    return `Error executing ${name}: ${err instanceof Error ? err.message : String(err)}`;
  }
}
