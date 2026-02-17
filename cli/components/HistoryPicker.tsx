import React, { useState } from "react";
import { Box, Text, useInput } from "ink";

interface Conversation {
  id: number;
  title: string;
  summary: string;
  model: string;
  created_at: string;
}

interface Props {
  conversations: Conversation[];
  onSelect: (conversation: Conversation) => void;
  onCancel: () => void;
}

export function HistoryPicker({ conversations, onSelect, onCancel }: Props) {
  const [index, setIndex] = useState(0);

  useInput((_input, key) => {
    if (key.upArrow) setIndex((i) => Math.max(0, i - 1));
    if (key.downArrow) setIndex((i) => Math.min(conversations.length - 1, i + 1));
    if (key.return && conversations.length > 0) {
      onSelect(conversations[index]);
    }
    if (key.escape) onCancel();
  });

  if (conversations.length === 0) {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Text dimColor>No saved conversations. Use /save to save one.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>Saved conversations ({"\u2191\u2193"} navigate, Enter select, Esc cancel):</Text>
      <Box flexDirection="column" marginTop={1}>
        {conversations.map((c, i) => (
          <Box key={c.id}>
            <Text color={i === index ? "cyan" : undefined}>
              {i === index ? "\u276F " : "  "}
            </Text>
            <Text bold={i === index}>
              {c.title}
            </Text>
            <Text dimColor> {c.model} {c.created_at}</Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
