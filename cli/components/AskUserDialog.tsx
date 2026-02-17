import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";

interface Props {
  model: string;
  question: string;
  options?: string[];
  onAnswer: (answer: string) => void;
  onCancel: () => void;
}

export function AskUserDialog({ model, question, options = [], onAnswer, onCancel }: Props) {
  const hasOptions = options.length > 0;
  const [index, setIndex] = useState(0);
  const [customText, setCustomText] = useState("");

  useInput((_input, key) => {
    if (key.escape) onCancel();
    if (!hasOptions) return;
    if (key.upArrow) setIndex((i) => Math.max(0, i - 1));
    if (key.downArrow) setIndex((i) => Math.min(options.length - 1, i + 1));
    if (key.return) onAnswer(options[index]);
  });

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>Question from {model}:</Text>
      <Text dimColor>────────────────────────</Text>
      <Text>{question}</Text>

      {hasOptions && (
        <Box flexDirection="column" marginTop={1}>
          {options.map((item, i) => (
            <Box key={i}>
              <Text color={i === index ? "yellow" : "gray"}>
                {i === index ? "● " : "○ "}
              </Text>
              <Text bold={i === index}>{item}</Text>
            </Box>
          ))}
          <Text dimColor>{"\u2191\u2193"} navigate, Enter select, Esc cancel</Text>
        </Box>
      )}

      <Box marginTop={hasOptions ? 1 : 0}>
        <Text color="yellow" bold>{">"} </Text>
        <TextInput
          value={customText}
          onChange={setCustomText}
          onSubmit={(val) => {
            const trimmed = val.trim();
            if (trimmed) onAnswer(trimmed);
          }}
        />
      </Box>
    </Box>
  );
}
