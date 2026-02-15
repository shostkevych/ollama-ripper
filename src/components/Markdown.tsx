import React from "react";
import { Text, Box } from "ink";
import { marked, type Token, type Tokens } from "marked";

function cleanLatex(raw: string): string {
  let s = raw;
  // Strip block/inline math delimiters
  s = s.replace(/\$\$(.+?)\$\$/gs, "$1");
  s = s.replace(/\\\[(.+?)\\\]/gs, "$1");
  s = s.replace(/\\\((.+?)\\\)/gs, "$1");
  s = s.replace(/\$(.+?)\$/g, "$1");
  // \frac{a}{b} → a/b
  s = s.replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, "$1 / $2");
  // \text{...} → ...
  s = s.replace(/\\text\{([^}]*)\}/g, "$1");
  // \sqrt{x} → √(x)
  s = s.replace(/\\sqrt\{([^}]*)\}/g, "\u221A($1)");
  // Common symbols
  s = s.replace(/\\approx/g, "\u2248");
  s = s.replace(/\\times/g, "\u00D7");
  s = s.replace(/\\div/g, "\u00F7");
  s = s.replace(/\\pm/g, "\u00B1");
  s = s.replace(/\\neq/g, "\u2260");
  s = s.replace(/\\leq/g, "\u2264");
  s = s.replace(/\\geq/g, "\u2265");
  s = s.replace(/\\infty/g, "\u221E");
  s = s.replace(/\\pi/g, "\u03C0");
  s = s.replace(/\\sum/g, "\u03A3");
  s = s.replace(/\\cdot/g, "\u00B7");
  s = s.replace(/\\ldots/g, "\u2026");
  s = s.replace(/\\rightarrow/g, "\u2192");
  s = s.replace(/\\leftarrow/g, "\u2190");
  // ^{x} → superscript, _{x} → subscript (just keep plain)
  s = s.replace(/\^\{([^}]*)\}/g, "^$1");
  s = s.replace(/_\{([^}]*)\}/g, "_$1");
  // Strip leftover backslashes from unknown commands
  s = s.replace(/\\([a-zA-Z]+)/g, "$1");
  return s;
}

export function Markdown({ content }: { content: string }) {
  const tokens = marked.lexer(cleanLatex(content));
  return (
    <Box flexDirection="column">
      {tokens.map((token, i) => (
        <BlockToken key={i} token={token} />
      ))}
    </Box>
  );
}

function BlockToken({ token }: { token: Token }) {
  switch (token.type) {
    case "heading": {
      const t = token as Tokens.Heading;
      const color = t.depth === 1 ? "magenta" : "green";
      return (
        <Text bold color={color}>
          {"#".repeat(t.depth)} <Inline tokens={t.tokens} />
        </Text>
      );
    }
    case "paragraph": {
      const t = token as Tokens.Paragraph;
      return (
        <Text>
          <Inline tokens={t.tokens} />
        </Text>
      );
    }
    case "code": {
      const t = token as Tokens.Code;
      return (
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor="gray"
          paddingX={1}
        >
          {t.lang && <Text dimColor>{t.lang}</Text>}
          <Text color="yellow">{t.text}</Text>
        </Box>
      );
    }
    case "list": {
      const t = token as Tokens.List;
      return (
        <Box flexDirection="column" paddingLeft={1}>
          {t.items.map((item, i) => (
            <ListItem
              key={i}
              item={item}
              index={i}
              ordered={t.ordered}
              start={t.start || 1}
            />
          ))}
        </Box>
      );
    }
    case "blockquote": {
      const t = token as Tokens.Blockquote;
      return (
        <Box>
          <Text dimColor>{"\u2502 "}</Text>
          <Box flexDirection="column">
            {t.tokens.map((child, i) => (
              <BlockToken key={i} token={child} />
            ))}
          </Box>
        </Box>
      );
    }
    case "table": {
      const t = token as Tokens.Table;
      return <MarkdownTable table={t} />;
    }
    case "hr":
      return <Text dimColor>{"\u2500".repeat(40)}</Text>;
    case "space":
      return null;
    default:
      return token.raw ? <Text>{token.raw}</Text> : null;
  }
}

function cellText(tokens: Token[]): string {
  return tokens
    .map((t) => {
      if ("text" in t && typeof t.text === "string") return t.text;
      if ("raw" in t && typeof t.raw === "string") return t.raw;
      return "";
    })
    .join("");
}

function MarkdownTable({ table }: { table: Tokens.Table }) {
  const colCount = table.header.length;

  // Compute column widths
  const widths: number[] = new Array(colCount).fill(0);
  for (let c = 0; c < colCount; c++) {
    widths[c] = Math.max(widths[c], cellText(table.header[c].tokens).length);
  }
  for (const row of table.rows) {
    for (let c = 0; c < colCount; c++) {
      if (row[c]) {
        widths[c] = Math.max(widths[c], cellText(row[c].tokens).length);
      }
    }
  }

  const pad = (s: string, w: number) => s + " ".repeat(Math.max(w - s.length, 0));
  const sep = widths.map((w) => "\u2500".repeat(w + 2)).join("\u253C");

  const formatRow = (cells: Tokens.TableCell[]) =>
    cells.map((cell, c) => ` ${pad(cellText(cell.tokens), widths[c])} `).join("\u2502");

  return (
    <Box flexDirection="column">
      <Text bold>{formatRow(table.header)}</Text>
      <Text dimColor>{sep}</Text>
      {table.rows.map((row, i) => (
        <Text key={i}>{formatRow(row)}</Text>
      ))}
    </Box>
  );
}

function ListItem({
  item,
  index,
  ordered,
  start,
}: {
  item: Tokens.ListItem;
  index: number;
  ordered: boolean;
  start: number;
}) {
  const bullet = ordered ? `${start + index}.` : "\u2022";

  // Simple: single text token
  if (
    item.tokens.length === 1 &&
    item.tokens[0].type === "text"
  ) {
    const t = item.tokens[0] as Tokens.Text;
    return (
      <Box>
        <Text>{bullet} </Text>
        <Text>
          {t.tokens ? <Inline tokens={t.tokens} /> : t.text}
        </Text>
      </Box>
    );
  }

  // Complex: paragraphs, nested lists, etc.
  return (
    <Box>
      <Text>{bullet} </Text>
      <Box flexDirection="column">
        {item.tokens.map((child, i) => (
          <BlockToken key={i} token={child} />
        ))}
      </Box>
    </Box>
  );
}

function Inline({ tokens }: { tokens: Token[] }) {
  return (
    <>
      {tokens.map((t, i) => (
        <InlineToken key={i} token={t} />
      ))}
    </>
  );
}

function InlineToken({ token }: { token: Token }) {
  switch (token.type) {
    case "text": {
      const t = token as Tokens.Text;
      if (t.tokens) {
        return (
          <Text>
            <Inline tokens={t.tokens} />
          </Text>
        );
      }
      return <Text>{t.text}</Text>;
    }
    case "strong": {
      const t = token as Tokens.Strong;
      return (
        <Text bold>
          <Inline tokens={t.tokens} />
        </Text>
      );
    }
    case "em": {
      const t = token as Tokens.Em;
      return (
        <Text italic>
          <Inline tokens={t.tokens} />
        </Text>
      );
    }
    case "codespan": {
      const t = token as Tokens.Codespan;
      return <Text color="yellow">{t.text}</Text>;
    }
    case "link": {
      const t = token as Tokens.Link;
      return (
        <Text>
          <Text color="cyan">
            <Inline tokens={t.tokens} />
          </Text>
          <Text dimColor> ({t.href})</Text>
        </Text>
      );
    }
    case "del": {
      const t = token as Tokens.Del;
      return (
        <Text strikethrough>
          <Inline tokens={t.tokens} />
        </Text>
      );
    }
    case "br":
      return <Text>{"\n"}</Text>;
    case "escape": {
      const t = token as Tokens.Escape;
      return <Text>{t.text}</Text>;
    }
    default:
      return <Text>{token.raw}</Text>;
  }
}
