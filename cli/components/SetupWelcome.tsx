import React, { useState, useRef, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import Spinner from "ink-spinner";
import TextInput from "ink-text-input";
import * as api from "../client/api";

const SETUP_LINES = [
  "Private and secure agentic CLI for Ollama.",
  "Run local models, use tools, and keep your data on your machine.",
  "",
  "Created by Oleh Shostkevych — https://shostkevych.com",
  "",
  "Let's get you set up.",
];
const SETUP_FULL = SETUP_LINES.join("\n");
const WAVE_WIDTH = 34;
const WAVE_CHARS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];

const STEP_PROMPTS: Record<number, string> = {
  1: "What should I call you? ",
  2: "Ollama URL (e.g. http://localhost:11434): ",
  25: "Server name (Enter to use URL): ",
  26: "Server VRAM in GB (e.g. 16, Enter to skip): ",
  4: "VRAM in GB (e.g. 16, Enter to skip): ",
  5: "Tavily API key (Enter to skip): ",
  6: "Exchange Rate API key (Enter to skip): ",
  9: "Daemon URL (Enter for http://localhost:7474): ",
  12: "Anthropic API key (Enter to skip — subscription auth will be used): ",
  13: "Claude model (Enter for claude-sonnet-4-5-20250929): ",
};

export function SetupWelcome({ initialStep, onComplete }: {
  initialStep: 1 | 2 | 3 | 4 | 5 | 6 | 9;
  onComplete: (name: string) => void;
}) {
  const [typed, setTyped] = useState(initialStep === 9 ? 0 : SETUP_FULL.length);
  const [tick, setTick] = useState(0);
  const [step, setStep] = useState<number>(initialStep);
  const [input, setInput] = useState("");
  const [log, setLog] = useState<string[]>([]);
  const [models, setModels] = useState<{ name: string; size: number }[] | null>(null);
  const [modelIdx, setModelIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const collectedName = useRef("");
  const collectedUrl = useRef("");
  const collectedServerName = useRef("");
  const typingDone = typed >= SETUP_FULL.length;

  // Tool picker state (step 7)
  const [toolNames, setToolNames] = useState<{ name: string; description: string; enabled: boolean }[]>([]);
  const [toolIdx, setToolIdx] = useState(0);
  const [toolEnabled, setToolEnabled] = useState<Record<string, boolean>>({});

  // Typing animation
  useEffect(() => {
    if (initialStep !== 9) return;
    const id = setInterval(() => {
      setTyped((t) => { if (t >= SETUP_FULL.length) { clearInterval(id); return t; } return t + 1; });
    }, 25);
    return () => clearInterval(id);
  }, []);

  // Wave animation
  useEffect(() => {
    const id = setInterval(() => setTick((t) => (t + 1) % 120), 80);
    return () => clearInterval(id);
  }, []);

  // Fetch models when entering step 3
  useEffect(() => {
    if (step === 3 && !models && !loading) {
      setLoading(true);
      api.getSetupModels()
        .then((m) => { setModels(m); setLoading(false); })
        .catch(() => {
          setLog((l) => [...l, "\u26A0 Could not fetch models, skipping."]);
          setStep(5);
          setLoading(false);
        });
    }
  }, [step]);

  // Load tools when entering step 7
  useEffect(() => {
    if (step === 7) {
      api.getSetupTools()
        .then((tools) => {
          setToolNames(tools);
          setToolIdx(0);
          const map: Record<string, boolean> = {};
          for (const t of tools) map[t.name] = t.enabled;
          setToolEnabled(map);
        })
        .catch(() => {
          setLog((l) => [...l, "\u2713 Tools: all enabled (default)"]);
          setStep(8);
        });
    }
  }, [step]);

  useInput((_input, key) => {
    if (step === 3 && models) {
      if (key.upArrow) setModelIdx((i) => Math.max(0, i - 1));
      if (key.downArrow) setModelIdx((i) => Math.min(models.length - 1, i + 1));
      if (key.return) {
        const entry = models[modelIdx];
        setLoading(true);
        api.postSetupStep(3, entry.name).then((res) => {
          setModels(null);
          setLoading(false);
          setLog((l) => [...l, `\u2713 Model: ${entry.name}`]);
          setStep(res.nextStep);
        }).catch(() => { setModels(null); setLoading(false); setStep(5); });
      }
      if (key.escape) {
        setLog((l) => [...l, "\u26A0 Model selection skipped."]);
        setModels(null);
        setStep(5);
      }
    }
    if (step === 7 && toolNames.length > 0) {
      if (key.upArrow) setToolIdx((i) => Math.max(0, i - 1));
      if (key.downArrow) setToolIdx((i) => Math.min(toolNames.length - 1, i + 1));
      if (_input === " ") {
        const name = toolNames[toolIdx].name;
        setToolEnabled((prev) => ({ ...prev, [name]: !prev[name] }));
      }
      if (key.return) {
        const disabled = toolNames.map((t) => t.name).filter((n) => !toolEnabled[n]);
        setLoading(true);
        api.postSetupStep(7, { disabled }).then((res) => {
          const count = toolNames.length - disabled.length;
          setLog((l) => [...l, `\u2713 Tools: ${count}/${toolNames.length} enabled`]);
          setLoading(false);
          setStep(res.nextStep);
        }).catch(() => { setLoading(false); setStep(8); });
      }
      if (key.escape) {
        setLog((l) => [...l, "\u2713 Tools: all enabled (default)"]);
        setStep(8);
      }
    }
    if (step === 8 && !loading) {
      if (_input === "y" || _input === "Y") {
        api.postSetupStep(8, "y").then((res) => {
          setLog((l) => [...l, "\u2713 Ultrathink: enabled"]);
          setStep(res.nextStep);
        }).catch(() => { onComplete(collectedName.current); });
      } else if (_input === "n" || _input === "N") {
        api.postSetupStep(8, "n").then(() => {
          setLog((l) => [...l, "\u2713 Ultrathink: skipped"]);
          onComplete(collectedName.current);
        }).catch(() => { onComplete(collectedName.current); });
      }
    }
    if (step === 10 && !loading) {
      if (_input === "a" || _input === "A") {
        setLoading(true);
        api.postSetupStep(10, "a").then((res) => {
          setLog((l) => [...l, "\u2713 Auth: API key"]);
          setLoading(false);
          setStep(res.nextStep);
        }).catch(() => { setLoading(false); setStep(12); });
      } else if (_input === "s" || _input === "S") {
        setLoading(true);
        api.postSetupStep(10, "s").then((res) => {
          setLog((l) => [...l, "\u2713 Auth: subscription"]);
          setLoading(false);
          setStep(res.nextStep);
        }).catch(() => { setLoading(false); setStep(12); });
      }
    }
  });

  const handleSubmit = async (val: string) => {
    const v = val.trim();
    if (step === 1) {
      if (!v) return;
      try {
        const res = await api.postSetupStep(1, v);
        collectedName.current = v;
        setLog((l) => [...l, `\u2713 Name: ${v}`]);
        setInput("");
        setStep(res.nextStep);
      } catch {}
    } else if (step === 2) {
      if (!v) return;
      collectedUrl.current = v;
      setLog((l) => [...l, `\u2713 Ollama: ${v}`]);
      setInput(v);
      setStep(25);
    } else if (step === 25) {
      const name = v || collectedUrl.current;
      collectedServerName.current = name;
      setLog((l) => [...l, `\u2713 Server: ${name}`]);
      setInput("");
      setStep(26);
    } else if (step === 26) {
      const gb = Number(v);
      try {
        const res = await api.postSetupStep(26, { serverName: collectedServerName.current, url: collectedUrl.current, vramGb: gb > 0 ? gb : undefined });
        setLog((l) => [...l, `\u2713 VRAM: ${v || "default"}`]);
        setInput("");
        setStep(res.nextStep);
      } catch {
        setInput("");
        setStep(3);
      }
    } else if (step === 4) {
      try {
        const res = await api.postSetupStep(4, v);
        setLog((l) => [...l, `\u2713 VRAM: ${v || "default"}`]);
        setInput("");
        setStep(res.nextStep);
      } catch { setInput(""); setStep(5); }
    } else if (step === 5) {
      try {
        const res = await api.postSetupStep(5, v);
        setLog((l) => [...l, `\u2713 Tavily: ${v ? "configured" : "skipped"}`]);
        setInput("");
        setStep(res.nextStep);
      } catch { setInput(""); setStep(6); }
    } else if (step === 6) {
      try {
        const res = await api.postSetupStep(6, v);
        setLog((l) => [...l, `\u2713 Exchange Rate: ${v ? "configured" : "skipped"}`]);
        setInput("");
        setStep(res.nextStep);
      } catch { setInput(""); setStep(7); }
    } else if (step === 9) {
      try {
        const res = await api.postSetupStep(9, v || "http://localhost:7474");
        setLog((l) => [...l, `\u2713 Daemon: ${v || "http://localhost:7474"}`]);
        setInput("");
        setStep(res.nextStep);
      } catch { setInput(""); setStep(1); }
    } else if (step === 12) {
      try {
        const res = await api.postSetupStep(12, v);
        setLog((l) => [...l, v ? "\u2713 Anthropic key: configured" : "\u2713 Anthropic key: skipped (subscription auth)"]);
        setInput("");
        setStep(res.nextStep);
      } catch { setInput(""); setStep(13); }
    } else if (step === 13) {
      const model = v || "claude-sonnet-4-5-20250929";
      try {
        await api.postSetupStep(13, model);
        setLog((l) => [...l, `\u2713 Claude model: ${model}`]);
        setInput("");
        onComplete(collectedName.current);
      } catch { onComplete(collectedName.current); }
    }
  };

  const displayed = SETUP_FULL.slice(0, typed);
  const waveLine = Array.from({ length: WAVE_WIDTH }, (_, i) => {
    const phase = ((i + tick) / WAVE_WIDTH) * Math.PI * 4;
    const val = (Math.sin(phase) + 1) / 2;
    const idx = Math.floor(val * (WAVE_CHARS.length - 1));
    return WAVE_CHARS[idx];
  }).join("");

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="green" paddingX={2} paddingY={1} marginTop={1}>
      <Text color="green">{waveLine}</Text>
      <Text color="green" bold>{"     "}{"─".repeat(3)} OLLAMA RIPPER {"─".repeat(3)}</Text>
      <Text> </Text>
      {displayed.split("\n").map((line, i) => (
        <Text key={i} color={line.startsWith("Created") ? "green" : undefined} dimColor={line.startsWith("Let")}>{`  ${line}`}</Text>
      ))}
      {typingDone && log.length > 0 && <Text> </Text>}
      {typingDone && log.map((entry, i) => (
        <Text key={`log-${i}`} dimColor>{`  ${entry}`}</Text>
      ))}
      {typingDone && !loading && step !== 3 && step !== 7 && step !== 8 && step !== 10 && STEP_PROMPTS[step] && (
        <Box marginTop={1}>
          <Text color="yellow" bold>{`  ${STEP_PROMPTS[step]}`}</Text>
          <TextInput value={input} onChange={setInput} onSubmit={handleSubmit} />
        </Box>
      )}
      {typingDone && step === 7 && toolNames.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>{"  Toggle tools (Space toggle, Enter confirm, Esc skip):"}</Text>
          {toolNames.map((tool, i) => {
            const on = toolEnabled[tool.name];
            const truncDesc = tool.description.length > 50 ? tool.description.slice(0, 47) + "..." : tool.description;
            return (
              <Box key={tool.name}>
                <Text color={i === toolIdx ? "cyan" : undefined}>
                  {"  "}{i === toolIdx ? "> " : "  "}
                </Text>
                <Text color={on ? "green" : "red"}>{on ? "[x]" : "[ ]"} </Text>
                <Text bold={i === toolIdx}>{tool.name}</Text>
                <Text dimColor>{" — "}{truncDesc}</Text>
              </Box>
            );
          })}
        </Box>
      )}
      {typingDone && step === 8 && (
        <Box marginTop={1}>
          <Text color="yellow" bold>{"  Enable ultrathink mode? (cloud AI for complex reasoning) "}</Text>
          <Text dimColor>(y/n)</Text>
        </Box>
      )}
      {typingDone && step === 10 && !loading && (
        <Box marginTop={1}>
          <Text color="yellow" bold>{"  Auth method: "}</Text>
          <Text dimColor>(a) API key  (s) Subscription</Text>
        </Box>
      )}
      {typingDone && loading && (
        <Box marginTop={1}>
          <Text color="yellow">{"  "}<Spinner type="dots" />{" Loading..."}</Text>
        </Box>
      )}
      {typingDone && step === 3 && models && !loading && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>{"  Select model (\u2191\u2193 Enter select, Esc skip):"}</Text>
          {models.map((m, i) => (
            <Text key={m.name} color={i === modelIdx ? "cyan" : undefined} bold={i === modelIdx}>
              {"  "}{i === modelIdx ? "\u276F " : "  "}{m.name} <Text dimColor>{(m.size / 1024 ** 3).toFixed(1)}GB</Text>
            </Text>
          ))}
        </Box>
      )}
    </Box>
  );
}
