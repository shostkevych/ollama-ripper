import * as fs from "node:fs";
import { registerTool } from "./registry";
import { storeDir, rulesPath } from "../store";

registerTool({
  spec: {
    type: "function",
    function: {
      name: "save_rule",
      description:
        "Save a rule or instruction to memory so it persists across conversations. Use when the user says remember, save, always do, never do, keep in mind, or similar.",
      parameters: {
        type: "object",
        properties: {
          rule: {
            type: "string",
            description: "The rule to save, written as a clear instruction",
          },
        },
        required: ["rule"],
      },
    },
  },
  async execute(args) {
    const rule = String(args.rule).trim();
    if (!rule) return "Error: empty rule";

    fs.mkdirSync(storeDir, { recursive: true });
    fs.appendFileSync(rulesPath, `- ${rule}\n`, "utf-8");

    return `Rule saved: "${rule}"`;
  },
});
