import React from "react";
import { Text } from "ink";
import { CLOUD_THINK_REGEX } from "../tools/cloud-think";

export function HighlightCloudThink({ text }: { text: string }) {
  const regex = new RegExp(CLOUD_THINK_REGEX.source, "gi");
  const parts = text.split(regex);
  const matches = text.match(regex);
  if (!matches) return <>{text}</>;

  return (
    <>
      {parts.map((part, i) => (
        <React.Fragment key={i}>
          {part}
          {matches[i] && <Text color="green" bold>{matches[i]}</Text>}
        </React.Fragment>
      ))}
    </>
  );
}
