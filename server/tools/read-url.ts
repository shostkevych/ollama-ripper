import { registerTool } from "./registry";
import { truncateText } from "../utils";

/**
 * Simple HTML-to-text extraction. Strips tags, decodes common entities,
 * collapses whitespace. No npm dependencies needed.
 */
function htmlToText(html: string): string {
  return html
    // Remove script/style blocks entirely
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    // Block elements → newlines
    .replace(/<\/(p|div|h[1-6]|li|tr|br|blockquote)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    // Strip remaining tags
    .replace(/<[^>]+>/g, "")
    // Decode common HTML entities
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    // Collapse whitespace
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

registerTool({
  spec: {
    type: "function",
    function: {
      name: "read_url",
      description:
        "Fetch a URL and extract its text content. Use this after web_search to read the full content of a promising result. Returns plain text extracted from HTML.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "The URL to fetch and read",
          },
        },
        required: ["url"],
      },
    },
  },
  async execute(args) {
    const url = String(args.url);

    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; OllamaRipper/1.0)",
        Accept: "text/html,application/xhtml+xml,text/plain",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      return `Failed to fetch (${res.status}): ${res.statusText}`;
    }

    const contentType = res.headers.get("content-type") ?? "";
    const body = await res.text();

    const text = contentType.includes("text/html") ? htmlToText(body) : body;

    if (!text) return "Page returned no readable content.";

    return truncateText(text);
  },
});
