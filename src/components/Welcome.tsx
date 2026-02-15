import React from "react";
import { Box, Text, useStdout } from "ink";
import { config } from "../config";
import * as os from "node:os";

export function Welcome() {
  const { stdout } = useStdout();
  const cols = stdout?.columns ?? 80;
  const user = config.userName;
  const cwd = process.cwd().replace(os.homedir(), "~");
  const model = config.ollama.model || "no model set";

  const innerWidth = Math.min(cols - 2, 74);
  const leftWidth = Math.floor(innerWidth * 0.6);
  const rightWidth = innerWidth - leftWidth;

  const tips = [
    "Getting started",
    `Type a question to chat with ${model}`,
    "Type /new to start fresh",
    "Type /model to switch models",
    "Type /me to change your name",
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
      {/* Left panel */}
      <Box
        flexDirection="column"
        width={leftWidth}
        alignItems="center"
        justifyContent="center"
      >
        <Text> </Text>
        <Text color="white" bold>
          Welcome back, {user}!
        </Text>
        <Text> </Text>
        <Text color="green" bold>OLLAMA RIPPER</Text>
        <Text> </Text>
        <Text color="white" bold>
          {model}
        </Text>
        <Text dimColor>{cwd}</Text>
        <Text> </Text>
      </Box>

      {/* Separator */}
      <Box flexDirection="column" paddingX={1}>
        {Array.from({ length: 14 }).map((_, i) => (
          <Text key={i} dimColor>
            {i === 0 || i === 13 ? " " : "\u2502"}
          </Text>
        ))}
      </Box>

      {/* Right panel */}
      <Box flexDirection="column" width={rightWidth} paddingTop={1}>
        <Text color="green" bold>
          {tips[0]}
        </Text>
        <Text dimColor>{"─".repeat(Math.max(rightWidth - 2, 10))}</Text>
        {tips.slice(1).map((tip, i) => (
          <Text key={i} dimColor>
            {tip}
          </Text>
        ))}
      </Box>
    </Box>
  );
}
