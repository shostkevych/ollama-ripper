import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import Spinner from "ink-spinner";
import * as api from "../client/api";
import { MultilineInput } from "./MultilineInput";

interface NewToolFlowProps {
  onDone: (message: string) => void;
}

type Phase = "describe" | "generating" | "review" | "done";

function extractCode(raw: string): string {
  let code = raw.trim();
  code = code.replace(/^```[\w]*\n?/, "").replace(/\n?```$/, "");
  return code.trim();
}

function extractToolName(code: string): string {
  const match = code.match(/name:\s*["']([^"']+)["']/);
  return match?.[1] ?? `custom_tool_${Date.now()}`;
}

export function NewToolFlow({ onDone }: NewToolFlowProps) {
  const [phase, setPhase] = useState<Phase>("describe");
  const [description, setDescription] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  const generate = async (desc: string) => {
    setPhase("generating");
    setError("");
    // For tool generation, we send a chat message to the server asking it to generate tool code
    // This is a simplified approach - the server handles the LLM call
    try {
      // We'll use a special message prefix that the user can handle
      // For now, just create a placeholder tool with the description
      setCode(`// Tool generation requires server-side LLM call\n// Description: ${desc}\n// Use /newtool on the server side or create manually in ~/.ollama-ripper/tools/`);
      setPhase("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("review");
    }
  };

  useInput((input, key) => {
    if (phase !== "review") return;
    if (input === "y" && code) {
      setPhase("done");
      const name = extractToolName(code);
      api.createCustomTool(name, code)
        .then(() => onDone(`Custom tool "${name}" created and registered.`))
        .catch((err) => onDone(`Failed to save tool: ${err instanceof Error ? err.message : String(err)}`));
    }
    if (input === "r") generate(description);
    if (input === "n" || key.escape) onDone("Tool creation cancelled.");
  });

  if (phase === "describe") {
    return (
      <MultilineInput
        onSubmit={(text) => {
          const trimmed = text.trim();
          if (!trimmed) { onDone("Tool creation cancelled."); return; }
          setDescription(trimmed);
          generate(trimmed);
        }}
        onCancel={() => onDone("Tool creation cancelled.")}
      />
    );
  }

  if (phase === "generating") {
    return (
      <Box marginTop={1}>
        <Text color="yellow"><Spinner type="dots" /> Generating tool code...</Text>
      </Box>
    );
  }

  if (phase === "review") {
    return (
      <Box flexDirection="column" marginTop={1}>
        {error ? (
          <Text color="red">Error: {error}</Text>
        ) : (
          <>
            <Text color="yellow" bold>Generated code:</Text>
            <Box marginTop={1} flexDirection="column">
              <Text color="green">{code}</Text>
            </Box>
          </>
        )}
        <Box marginTop={1}>
          <Text dimColor>{code ? "[y] save  [r] retry  [n/Esc] cancel" : "[r] retry  [n/Esc] cancel"}</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box marginTop={1}>
      <Text color="yellow"><Spinner type="dots" /> Saving tool...</Text>
    </Box>
  );
}
