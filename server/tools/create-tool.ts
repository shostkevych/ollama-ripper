import { registerTool } from "./registry";
import { promptUser } from "./ask-user";
import { saveAndRegisterTool } from "./custom-loader";

registerTool({
  spec: {
    type: "function",
    function: {
      name: "create_tool",
      description:
        'Create a custom tool from TypeScript code. The code will be shown to the user for approval before saving. Code must export `spec` in nested format: `export const spec = { type: "function", function: { name, description, parameters } }` and `export async function execute(args): Promise<string>`. Use global `fetch` for HTTP (no imports needed). Do NOT import node-fetch.',
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Tool name (lowercase, hyphens allowed, e.g. 'http-ping')",
          },
          code: {
            type: "string",
            description:
              'Full TypeScript module. Must export `spec` with nested `{ type: "function", function: { name, description, parameters } }` and `execute(args): Promise<string>`.',
          },
        },
        required: ["name", "code"],
      },
    },
  },
  async execute(args) {
    const name = String(args.name);
    const code = String(args.code);

    // Validation
    if (!/^[a-z][a-z0-9-]*$/.test(name)) {
      return "Error: name must be lowercase alphanumeric with hyphens (e.g. 'http-ping').";
    }
    if (!code.includes("export") || !code.includes("spec") || !code.includes("execute")) {
      return "Error: code must export `spec` and `execute`.";
    }
    if (code.includes("node-fetch")) {
      return 'Error: do not import node-fetch. Use the global `fetch` (built into Bun).';
    }
    if (!code.includes('type: "function"') && !code.includes("type: 'function'")) {
      return 'Error: spec must use nested format: { type: "function", function: { name, description, parameters } }.';
    }

    // Show code to user for approval
    const preview = `I want to create a tool called "${name}" with this code:\n\n\`\`\`typescript\n${code}\n\`\`\`\n\nDo you approve?`;

    let answer: string;
    try {
      answer = await promptUser(preview, ["Yes", "No"]);
    } catch {
      return "Error: could not ask user for approval (no active session).";
    }

    const approved = answer.toLowerCase().startsWith("y");
    if (!approved) {
      return "Tool creation rejected by user.";
    }

    try {
      await saveAndRegisterTool(name, code);
    } catch (err) {
      return `Error saving tool: ${err instanceof Error ? err.message : String(err)}`;
    }

    return `Tool "${name}" created and registered successfully.`;
  },
});
