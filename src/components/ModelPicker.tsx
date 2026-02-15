import React, { useState } from "react";
import { Box, Text, useInput } from "ink";

interface Props {
  models: string[];
  current: string;
  onSelect: (model: string) => void;
  onCancel: () => void;
}

export function ModelPicker({ models, current, onSelect, onCancel }: Props) {
  const [index, setIndex] = useState(() =>
    Math.max(0, models.indexOf(current))
  );

  useInput((_input, key) => {
    if (key.upArrow) setIndex((i) => Math.max(0, i - 1));
    if (key.downArrow) setIndex((i) => Math.min(models.length - 1, i + 1));
    if (key.return) onSelect(models[index]);
    if (key.escape) onCancel();
  });

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>Select model (↑↓ navigate, Enter select, Esc cancel):</Text>
      <Box flexDirection="column" marginTop={1}>
        {models.map((m, i) => (
          <Box key={m}>
            <Text color={i === index ? "cyan" : undefined}>
              {i === index ? "❯ " : "  "}
            </Text>
            <Text
              color={m === current ? "green" : undefined}
              bold={i === index}
            >
              {m}
            </Text>
            {m === current && <Text dimColor> (current)</Text>}
          </Box>
        ))}
      </Box>
    </Box>
  );
}
