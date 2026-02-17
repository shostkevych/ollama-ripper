import { registerTool } from "./registry";
import { promptUser } from "./ask-user";
import { saveAndRegisterTool } from "./custom-loader";

registerTool({
  spec: {
    type: "function",
    function: {
      name: "create_tool",
      description:
        "Create a custom tool from TypeScript code. The code must export a `spec` (OllamaTool) and an `execute(args) => Promise<string>` function. The code will be shown to the user for approval before saving.",
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
              "Full TypeScript module source. Must export `spec` and `execute`.",
          },
        },
        required: ["name", "code"],
      },
    },
  },
  async execute(args) {
    const name = String(args.name);
    const code = String(args.code);

    // Basic validation
    if (!/^[a-z][a-z0-9-]*$/.test(name)) {
      return "Error: name must be lowercase alphanumeric with hyphens (e.g. 'http-ping').";
    }
    if (!code.includes("export") || !code.includes("spec") || !code.includes("execute")) {
      return "Error: code must export `spec` and `execute`.";
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
