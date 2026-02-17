import React, { useState } from "react";
import { Box, Text, useInput } from "ink";

interface MultilineInputProps {
  onSubmit: (text: string) => void;
  onCancel: () => void;
}

export function MultilineInput({ onSubmit, onCancel }: MultilineInputProps) {
  const [text, setText] = useState("");

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }
    // Ctrl+D → submit
    if (key.ctrl && input === "d") {
      onSubmit(text);
      return;
    }
    if (key.return) {
      setText((t) => t + "\n");
      return;
    }
    if (key.backspace || key.delete) {
      setText((t) => t.slice(0, -1));
      return;
    }
    if (input && !key.ctrl && !key.meta) {
      setText((t) => t + input);
    }
  });

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color="yellow" bold>Describe the tool you want to create:</Text>
      <Text dimColor>(Enter = newline, Ctrl+D = submit, Esc = cancel)</Text>
      <Box marginTop={1}>
        <Text>{text}<Text color="green">_</Text></Text>
      </Box>
    </Box>
  );
}
