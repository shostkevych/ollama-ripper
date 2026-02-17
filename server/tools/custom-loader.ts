import * as fs from "node:fs";
import * as path from "node:path";
import { registerTool } from "./registry";
import { storeDir } from "../store";

const toolsDir = path.join(storeDir, "tools");

export async function loadCustomTools(): Promise<void> {
  if (!fs.existsSync(toolsDir)) return;

  const files = fs.readdirSync(toolsDir).filter((f) => f.endsWith(".ts"));
  for (const file of files) {
    try {
      const filePath = path.join(toolsDir, file);
      const mod = await import(filePath);
      if (mod.spec && mod.execute) {
        registerTool({ spec: mod.spec, execute: mod.execute });
      }
    } catch {
      // skip broken custom tools silently
    }
  }
}

export async function saveAndRegisterTool(name: string, code: string): Promise<void> {
  fs.mkdirSync(toolsDir, { recursive: true });
  const filePath = path.join(toolsDir, `${name}.ts`);
  fs.writeFileSync(filePath, code);

  const mod = await import(`${filePath}?t=${Date.now()}`);
  registerTool({ spec: mod.spec, execute: mod.execute });
}
