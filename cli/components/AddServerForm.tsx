import React, { useState } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";

interface Props {
  onComplete: (name: string, url: string, vramGb?: number) => void;
  onCancel: () => void;
}

export function AddServerForm({ onComplete, onCancel }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [vram, setVram] = useState("");

  if (step === 1) {
    return (
      <Box marginTop={1}>
        <Text color="yellow" bold>Server URL: </Text>
        <TextInput
          value={url}
          onChange={setUrl}
          onSubmit={(val) => {
            const trimmed = val.trim();
            if (!trimmed) {
              onCancel();
              return;
            }
            setUrl(trimmed);
            setName(trimmed);
            setStep(2);
          }}
        />
      </Box>
    );
  }

  if (step === 2) {
    return (
      <Box marginTop={1}>
        <Text color="yellow" bold>Server name ({url}): </Text>
        <TextInput
          value={name}
          onChange={setName}
          onSubmit={(val) => {
            setName(val.trim() || url);
            setStep(3);
          }}
        />
      </Box>
    );
  }

  return (
    <Box marginTop={1}>
      <Text color="yellow" bold>VRAM in GB (Enter to skip): </Text>
      <TextInput
        value={vram}
        onChange={setVram}
        onSubmit={(val) => {
          const gb = Number(val.trim());
          onComplete(name, url, gb > 0 ? gb : undefined);
        }}
      />
    </Box>
  );
}
