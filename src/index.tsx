import React from "react";
import { render } from "ink";
import "./tools/web-search";
import "./tools/read-url";
import "./tools/read-file";
import "./tools/save-rule";
import "./tools/exchange-rate";
import "./tools/knowledge";
import { initMcp } from "./mcp";
import { config } from "./config";
import { App } from "./components/App";

await initMcp(config.obsidianVault);
render(<App />);
