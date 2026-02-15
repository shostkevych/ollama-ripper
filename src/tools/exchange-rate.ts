import { registerTool } from "./registry";
import { config } from "../config";

if (config.exchangeRateApiKey) {
  registerTool({
    spec: {
      type: "function",
      function: {
        name: "get_exchange_rate",
        description:
          "Get current exchange rates. Use this when you need to convert currencies or look up exchange rates. Returns rates relative to the specified base currency.",
        parameters: {
          type: "object",
          properties: {
            base: {
              type: "string",
              description:
                'The base currency code (e.g. "USD", "EUR", "UAH"). Defaults to USD.',
            },
            targets: {
              type: "string",
              description:
                'Comma-separated target currency codes to return (e.g. "EUR,GBP,UAH"). If omitted, returns all available rates.',
            },
          },
          required: [],
        },
      },
    },
    async execute(args) {
      const base = (args.base as string)?.toUpperCase() || "USD";
      const url = `https://v6.exchangerate-api.com/v6/${config.exchangeRateApiKey}/latest/${base}`;

      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Exchange rate API failed (${res.status}): ${await res.text()}`);
      }

      const data = await res.json();
      if (data.result !== "success") {
        throw new Error(`Exchange rate API error: ${data["error-type"] || "unknown"}`);
      }

      const rates: Record<string, number> = data.conversion_rates;

      if (args.targets) {
        const targets = (args.targets as string)
          .toUpperCase()
          .split(",")
          .map((t) => t.trim());
        const filtered: Record<string, number> = {};
        for (const t of targets) {
          if (rates[t] !== undefined) {
            filtered[t] = rates[t];
          } else {
            filtered[t] = -1; // not found marker
          }
        }
        return `Exchange rates (base: ${base}):\n${Object.entries(filtered)
          .map(([k, v]) => (v === -1 ? `  ${k}: not available` : `  ${k}: ${v}`))
          .join("\n")}`;
      }

      // Return all rates — trim to keep output manageable
      const entries = Object.entries(rates);
      return `Exchange rates (base: ${base}, ${entries.length} currencies):\n${entries
        .map(([k, v]) => `  ${k}: ${v}`)
        .join("\n")}`;
    },
  });
}
