import * as fs from "node:fs";
import * as path from "node:path";
import { registerTool } from "./registry";
import { truncateText } from "../utils";

registerTool({
  spec: {
    type: "function",
    function: {
      name: "read_file",
      description:
        "Read the contents of a local file by its absolute or relative path. Use this when the user provides a file path and wants you to read, analyze, or summarize its contents.",
      parameters: {
        type: "object",
        properties: {
          file_path: {
            type: "string",
            description: "The path to the file to read",
          },
        },
        required: ["file_path"],
      },
    },
  },
  async execute(args) {
    const filePath = path.resolve(String(args.file_path));

    if (!fs.existsSync(filePath)) {
      return `File not found: ${filePath}`;
    }

    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      return `Path is a directory, not a file: ${filePath}`;
    }

    const text = fs.readFileSync(filePath, "utf-8");

    if (!text.trim()) return "File is empty.";

    return truncateText(text);
  },
});
