import React, { useState } from "react";
import { Box, Text, useInput } from "ink";

function formatSize(bytes: number): string {
  return (bytes / 1024 ** 3).toFixed(1) + "GB";
}

interface Props {
  models: { name: string; size: number }[];
  current: string;
  onSelect: (model: string) => void;
  onCancel: () => void;
}

export function ModelPicker({ models, current, onSelect, onCancel }: Props) {
  const [index, setIndex] = useState(() =>
    Math.max(0, models.findIndex((m) => m.name === current))
  );

  useInput((_input, key) => {
    if (key.upArrow) setIndex((i) => Math.max(0, i - 1));
    if (key.downArrow) setIndex((i) => Math.min(models.length - 1, i + 1));
    if (key.return) onSelect(models[index].name);
    if (key.escape) onCancel();
  });

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>Select model ({"\u2191\u2193"} navigate, Enter select, Esc cancel):</Text>
      <Box flexDirection="column" marginTop={1}>
        {models.map((m, i) => (
          <Box key={m.name}>
            <Text color={i === index ? "cyan" : undefined}>
              {i === index ? "\u276F " : "  "}
            </Text>
            <Text
              color={m.name === current ? "green" : undefined}
              bold={i === index}
            >
              {m.name}
            </Text>
            <Text dimColor> {formatSize(m.size)}</Text>
            {m.name === current && <Text dimColor> (current)</Text>}
          </Box>
        ))}
      </Box>
    </Box>
  );
}
