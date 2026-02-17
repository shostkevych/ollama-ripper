import React from "react";
import { Box, Text, useStdout } from "ink";
import Spinner from "ink-spinner";
import * as os from "node:os";

export function Welcome({ ready, wakingUp, wakeWord, config }: {
  ready: boolean;
  wakingUp: boolean;
  wakeWord: string;
  config: Record<string, any>;
}) {
  const { stdout } = useStdout();
  const cols = stdout?.columns ?? 80;
  const user = config.userName || "";
  const cwd = process.cwd().replace(os.homedir(), "~");
  const model = (config.ollama as any)?.model || "no model set";
  const modelSize = (config.ollama as any)?.modelSizeBytes
    ? ((config.ollama as any).modelSizeBytes / 1024 ** 3).toFixed(1) + "GB"
    : "";
  const activeServer = config.activeServer || (config.ollama as any)?.url || "";

  const innerWidth = Math.min(cols - 2, 74);
  const leftWidth = Math.floor(innerWidth * 0.6);
  const rightWidth = innerWidth - leftWidth;

  const tips = [
    "Getting started",
    `Type a question to chat with ${model}`,
    "Type /new to start fresh",
    "Type /model to switch models",
    "Type /server to switch servers",
    "Type /vram to set server VRAM",
    "Type /me to change your name",
    "Type /cloud to configure Claude model",
    "Type /newtool to create a custom tool",
    "Type /save to save conversation",
    "Type /history to resume a conversation",
    "Type /compact to free up context",
    "Shift+Tab to toggle shell mode",
    "Type exit to quit",
  ];

  return (
    <Box
      flexDirection="row"
      borderStyle="round"
      borderColor="green"
      width={innerWidth + 2}
      paddingX={1}
    >
      <Box flexDirection="column" width={leftWidth} alignItems="center" justifyContent="center">
        <Text> </Text>
        <Text color="white" bold>Welcome back, {user}!</Text>
        <Text> </Text>
        <Text color="green" bold>OLLAMA RIPPER</Text>
        <Text> </Text>
        <Text color="white" bold>
          {model}{modelSize ? <Text dimColor> {modelSize}</Text> : null}
        </Text>
        <Text dimColor>{activeServer}</Text>
        <Text dimColor>{cwd}</Text>
        <Text> </Text>
        {ready
          ? <Text color="green" bold>{wakeWord || "Ready"} !</Text>
          : wakingUp
            ? <Text color="yellow"><Spinner type="dots" /> Waking up...</Text>
            : <Text color="yellow"><Spinner type="dots" /> Loading model...</Text>
        }
      </Box>

      <Box flexDirection="column" paddingX={1}>
        {Array.from({ length: 14 }).map((_, i) => (
          <Text key={i} dimColor>{i === 0 || i === 13 ? " " : "\u2502"}</Text>
        ))}
      </Box>

      <Box flexDirection="column" width={rightWidth} paddingTop={1}>
        <Text color="green" bold>{tips[0]}</Text>
        <Text dimColor>{"─".repeat(Math.max(rightWidth - 2, 10))}</Text>
        {tips.slice(1).map((tip, i) => (
          <Text key={i} dimColor>{tip}</Text>
        ))}
      </Box>
    </Box>
  );
}
