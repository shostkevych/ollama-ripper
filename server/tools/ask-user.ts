import { registerTool } from "./registry";

let askCallback: ((q: string, opts: string[]) => Promise<string>) | null = null;

export function setAskUserCallback(cb: typeof askCallback) {
  askCallback = cb;
}

export function clearAskUserCallback() {
  askCallback = null;
}

export async function promptUser(question: string, options: string[] = []): Promise<string> {
  if (!askCallback) throw new Error("No active chat session");
  return askCallback(question, options);
}

registerTool({
  spec: {
    type: "function",
    function: {
      name: "ask_user",
      description:
        "Ask the user a clarifying question when you are genuinely unsure or need specific input. Do not overuse — only when clarification is truly needed.",
      parameters: {
        type: "object",
        properties: {
          question: {
            type: "string",
            description: "The question to ask the user",
          },
          options: {
            type: "array",
            items: { type: "string" },
            description: "Up to 3 predefined answer options (optional)",
          },
        },
        required: ["question"],
      },
    },
  },
  async execute(args) {
    const question = String(args.question);
    const options = Array.isArray(args.options)
      ? (args.options as string[]).slice(0, 3)
      : [];

    if (!askCallback) {
      return "Error: ask_user callback not configured.";
    }

    try {
      return await askCallback(question, options);
    } catch {
      return "[User declined to answer]";
    }
  },
});
