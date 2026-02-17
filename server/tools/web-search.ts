import { config } from "../config";
import { registerTool } from "./registry";

interface SearchResult {
  title: string;
  url: string;
  content: string;
}

/** URLs from the most recent web search, used for "Based on" attribution. */
let lastSearchSources: string[] = [];

/** Returns source URLs from the last web_search call (resets after read). */
export function consumeSearchSources(): string[] {
  const sources = lastSearchSources;
  lastSearchSources = [];
  return sources;
}

async function searchTavily(query: string): Promise<SearchResult[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.tavily.apiKey}`,
    },
    body: JSON.stringify({
      query,
      max_results: 3,
      include_answer: false,
    }),
  });

  if (!res.ok) {
    throw new Error(`Tavily search failed (${res.status}): ${await res.text()}`);
  }

  const data = await res.json();
  return (data.results as { title: string; url: string; content: string }[]).map(
    (r) => ({ title: r.title, url: r.url, content: r.content })
  );
}

function formatResults(results: SearchResult[]): string {
  if (!results.length) return "No results found.";
  return results
    .map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.content}`)
    .join("\n\n");
}

registerTool({
  spec: {
    type: "function",
    function: {
      name: "web_search",
      description:
        "Search the web. Use this when you need current information, facts you are unsure about, or anything that benefits from a web lookup.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query",
          },
        },
        required: ["query"],
      },
    },
  },
  async execute(args) {
    const query = String(args.query);

    if (!config.tavily.apiKey) {
      return "Tavily API key is not configured. Use /settings or restart the app to set it up.";
    }

    try {
      const results = await searchTavily(query);
      lastSearchSources = results.map((r) => r.url);
      return formatResults(results);
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  },
});
