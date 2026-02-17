import * as fs from "node:fs";
import * as path from "node:path";
import { registerTool } from "./registry";
import { timestamp } from "../utils";

const knowledgePath = path.resolve(import.meta.dir, "../knowledge.md");

function ensureFile() {
  if (!fs.existsSync(knowledgePath)) {
    fs.writeFileSync(knowledgePath, "# Knowledge Base\n", "utf-8");
  }
}

registerTool({
  spec: {
    type: "function",
    function: {
      name: "knowledge_store",
      description:
        "Store information to the knowledge base for later retrieval. Use when the user says store, remember, add to knowledge, save this, keep this, note this, or similar.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Short title or topic for this entry",
          },
          content: {
            type: "string",
            description: "The information to store",
          },
        },
        required: ["title", "content"],
      },
    },
  },
  async execute(args) {
    const title = String(args.title).trim();
    const content = String(args.content).trim();
    if (!title || !content) return "Error: title and content required";

    ensureFile();

    const entry = `\n-----\n\n### ${title}\n_${timestamp()}_\n\n${content}\n`;
    fs.appendFileSync(knowledgePath, entry, "utf-8");

    return `Stored to knowledge base: "${title}"`;
  },
});

registerTool({
  spec: {
    type: "function",
    function: {
      name: "knowledge_search",
      description:
        "Search the knowledge base for previously stored information. Use when the user asks something that might have been saved before, or when you need to recall stored facts, notes, or preferences.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search term or topic to look for",
          },
        },
        required: ["query"],
      },
    },
  },
  async execute(args) {
    const query = String(args.query).trim().toLowerCase();
    if (!query) return "Error: query required";

    ensureFile();

    const file = fs.readFileSync(knowledgePath, "utf-8");
    const entries = file.split("-----").slice(1); // skip header

    if (!entries.length) return "Knowledge base is empty.";

    const matches = entries.filter((e) => e.toLowerCase().includes(query));

    if (!matches.length) {
      return `No entries found for "${query}". Knowledge base has ${entries.length} entries.`;
    }

    return matches.join("\n-----\n").trim();
  },
});
