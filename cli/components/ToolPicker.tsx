import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import Spinner from "ink-spinner";
import * as api from "../client/api";

interface Props {
  onDone: () => void;
}

export function ToolPicker({ onDone }: Props) {
  const [allTools, setAllTools] = useState<{ name: string; description: string; enabled: boolean }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getTools()
      .then((tools) => { setAllTools(tools); setLoading(false); })
      .catch(() => { setLoading(false); onDone(); });
  }, []);

  const [index, setIndex] = useState(0);
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const map: Record<string, boolean> = {};
    for (const t of allTools) map[t.name] = t.enabled;
    setEnabled(map);
  }, [allTools]);

  useInput((_input, key) => {
    if (loading) return;
    if (key.upArrow) setIndex((i) => Math.max(0, i - 1));
    if (key.downArrow) setIndex((i) => Math.min(allTools.length - 1, i + 1));
    if (_input === " ") {
      const name = allTools[index]?.name;
      if (name) setEnabled((prev) => ({ ...prev, [name]: !prev[name] }));
    }
    if (key.return) {
      const promises = allTools.map((t) => {
        if (enabled[t.name] !== t.enabled) {
          return api.toggleTool(t.name, enabled[t.name]);
        }
        return Promise.resolve();
      });
      Promise.all(promises).then(() => onDone()).catch(() => onDone());
    }
    if (key.escape) onDone();
  });

  if (loading) {
    return (
      <Box marginTop={1}>
        <Text color="yellow"><Spinner type="dots" /> Loading tools...</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>Tools (Space toggle, Enter confirm, Esc cancel):</Text>
      {allTools.length === 0 && (
        <Text dimColor>  No tools registered.</Text>
      )}
      {allTools.map((tool, i) => {
        const on = enabled[tool.name];
        const truncDesc = tool.description.length > 60 ? tool.description.slice(0, 57) + "..." : tool.description;
        return (
          <Box key={tool.name}>
            <Text color={i === index ? "cyan" : undefined}>
              {i === index ? ">" : " "}{" "}
            </Text>
            <Text color={on ? "green" : "red"}>{on ? "[x]" : "[ ]"} </Text>
            <Text bold={i === index}>{tool.name}</Text>
            <Text dimColor>{" — "}{truncDesc}</Text>
          </Box>
        );
      })}
    </Box>
  );
}
