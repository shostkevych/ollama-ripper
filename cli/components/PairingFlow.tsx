import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import TextInput from "ink-text-input";
import * as api from "../client/api";
import { saveClientConfig } from "../client/store";

export function PairingFlow({ serverUrl, onPaired }: {
  serverUrl: string;
  onPaired: (token: string) => void;
}) {
  const [status, setStatus] = useState<"requesting" | "entering" | "verifying" | "error">("requesting");
  const [code, setCode] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    api.requestPairing()
      .then(() => setStatus("entering"))
      .catch((err) => {
        setErrorMsg(err instanceof Error ? err.message : String(err));
        setStatus("error");
      });
  }, []);

  const handleSubmit = async (val: string) => {
    const trimmed = val.trim();
    if (!trimmed) return;
    setStatus("verifying");
    try {
      const { token } = await api.verifyPairing(trimmed);
      saveClientConfig({ token });
      onPaired(token);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  };

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="green" paddingX={2} paddingY={1} marginTop={1}>
      <Text color="green" bold>{"─".repeat(3)} OLLAMA RIPPER PAIRING {"─".repeat(3)}</Text>
      <Text> </Text>
      <Text dimColor>Server: {serverUrl}</Text>
      <Text> </Text>

      {status === "requesting" && (
        <Text color="yellow"><Spinner type="dots" /> Requesting pairing code...</Text>
      )}

      {status === "entering" && (
        <Box flexDirection="column">
          <Text>A 6-digit pairing code has been printed on the server terminal.</Text>
          <Box marginTop={1}>
            <Text color="yellow" bold>Enter code: </Text>
            <TextInput value={code} onChange={setCode} onSubmit={handleSubmit} />
          </Box>
        </Box>
      )}

      {status === "verifying" && (
        <Text color="yellow"><Spinner type="dots" /> Verifying...</Text>
      )}

      {status === "error" && (
        <Box flexDirection="column">
          <Text color="red">{errorMsg}</Text>
          <Text dimColor>Press Ctrl+C to exit and try again.</Text>
        </Box>
      )}
    </Box>
  );
}
