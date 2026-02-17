import React, { useState } from "react";
import { Box, Text, useInput } from "ink";

interface OllamaServer {
  name: string;
  url: string;
  vramGb?: number;
}

interface Props {
  servers: OllamaServer[];
  activeServer: string;
  onSelect: (server: OllamaServer) => void;
  onAddNew: () => void;
  onCancel: () => void;
}

export function ServerPicker({ servers, activeServer, onSelect, onAddNew, onCancel }: Props) {
  const itemCount = servers.length + 1; // +1 for "Add new server"
  const [index, setIndex] = useState(() => {
    const active = servers.findIndex((s) => s.name === activeServer);
    return Math.max(0, active);
  });

  useInput((_input, key) => {
    if (key.upArrow) setIndex((i) => Math.max(0, i - 1));
    if (key.downArrow) setIndex((i) => Math.min(itemCount - 1, i + 1));
    if (key.return) {
      if (index === servers.length) {
        onAddNew();
      } else {
        onSelect(servers[index]);
      }
    }
    if (key.escape) onCancel();
  });

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>Select server ({"\u2191\u2193"} navigate, Enter select, Esc cancel):</Text>
      <Box flexDirection="column" marginTop={1}>
        {servers.map((s, i) => (
          <Box key={s.name}>
            <Text color={i === index ? "cyan" : undefined}>
              {i === index ? "\u276F " : "  "}
            </Text>
            <Text
              color={s.name === activeServer ? "green" : undefined}
              bold={i === index}
            >
              {s.name} ({s.url}){s.vramGb ? ` [${s.vramGb}GB]` : ""}
            </Text>
            {s.name === activeServer && <Text dimColor> (active)</Text>}
          </Box>
        ))}
        <Box>
          <Text color={index === servers.length ? "cyan" : undefined}>
            {index === servers.length ? "\u276F " : "  "}
          </Text>
          <Text color="yellow" bold={index === servers.length}>
            + Add new server...
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
