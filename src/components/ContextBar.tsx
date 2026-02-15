import React from "react";
import { Box, Text, useStdout } from "ink";

export function ContextBar({ used, max }: { used: number; max: number }) {
  const { stdout } = useStdout();
  const width = Math.min((stdout?.columns ?? 80) - 2, 60);
  const barWidth = width - 30; // space for labels
  const ratio = Math.min(used / max, 1);
  const filled = Math.round(ratio * barWidth);
  const empty = barWidth - filled;
  const pct = Math.round(ratio * 100);

  const color = pct < 50 ? "green" : pct < 80 ? "yellow" : "red";

  return (
    <Box>
      <Text dimColor>ctx </Text>
      <Text color={color}>
        {"\u2588".repeat(filled)}
      </Text>
      <Text dimColor>
        {"\u2591".repeat(empty)}
      </Text>
      <Text dimColor>
        {" "}
        {used.toLocaleString()}/{max.toLocaleString()} ({pct}%)
      </Text>
    </Box>
  );
}
