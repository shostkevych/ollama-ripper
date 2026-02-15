import React, { useState, useRef, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import Spinner from "ink-spinner";
import TextInput from "ink-text-input";
import { config, setModel, setUserName, setOpenAiKey, setOpenAiModel, setOllamaUrl, setVramGb, setTavilyKey, setExchangeRateApiKey, setSetupDone } from "../config";
import { listModels, getModelInfo } from "../ollama";

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
  4: "VRAM in GB (e.g. 16, Enter to skip): ",
  5: "Tavily API key (Enter to skip): ",
  6: "Exchange Rate API key (Enter to skip): ",
  8: "OpenAI API key: ",
  9: "OpenAI model (e.g. gpt-4o, Enter for gpt-5.2): ",
};

export function SetupWelcome({ initialStep, onComplete }: {
  initialStep: 1 | 2 | 3 | 4 | 5 | 6;
  onComplete: (name: string) => void;
}) {
  const [typed, setTyped] = useState(initialStep === 1 ? 0 : SETUP_FULL.length);
  const [tick, setTick] = useState(0);
  const [step, setStep] = useState<number>(initialStep);
  const [input, setInput] = useState("");
  const [log, setLog] = useState<string[]>([]);
  const [models, setModels] = useState<string[] | null>(null);
  const [modelIdx, setModelIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const collectedName = useRef(config.userName);
  const typingDone = typed >= SETUP_FULL.length;

  // Typing animation (only on fresh setup)
  useEffect(() => {
    if (initialStep > 1) return;
    const id = setInterval(() => {
      setTyped((t) => {
        if (t >= SETUP_FULL.length) { clearInterval(id); return t; }
        return t + 1;
      });
    }, 25);
    return () => clearInterval(id);
  }, []);

  // Inference wave animation
  useEffect(() => {
    const id = setInterval(() => setTick((t) => (t + 1) % 120), 80);
    return () => clearInterval(id);
  }, []);

  // Fetch models when entering step 3
  useEffect(() => {
    if (step === 3 && !models && !loading) {
      setLoading(true);
      listModels()
        .then((m) => { setModels(m); setLoading(false); })
        .catch(() => {
          setLog((l) => [...l, "\u26A0 Could not fetch models, skipping."]);
          setStep(4);
          setLoading(false);
        });
    }
  }, [step]);

  // Model picker keyboard + ultrathink y/n
  useInput((_input, key) => {
    // Step 3: model picker
    if (step === 3 && models) {
      if (key.upArrow) setModelIdx((i) => Math.max(0, i - 1));
      if (key.downArrow) setModelIdx((i) => Math.min(models.length - 1, i + 1));
      if (key.return) {
        const model = models[modelIdx];
        setLoading(true);
        getModelInfo(model).then((info) => {
          const numCtx = info?.numCtx ?? config.ollama.numCtx;
          setModel(model, numCtx);
          setModels(null);
          setLoading(false);
          setLog((l) => [...l, `\u2713 Model: ${model}`]);
          setStep(4);
        });
      }
      if (key.escape) {
        setLog((l) => [...l, "\u26A0 Model selection skipped."]);
        setModels(null);
        setStep(4);
      }
    }
    // Step 7: ultrathink y/n
    if (step === 7 && !loading) {
      if (_input === "y" || _input === "Y") {
        setLog((l) => [...l, "\u2713 Ultrathink: enabled"]);
        setStep(8);
      } else if (_input === "n" || _input === "N") {
        setLog((l) => [...l, "\u2713 Ultrathink: skipped"]);
        setSetupDone();
        onComplete(collectedName.current);
      }
    }
  });

  const handleSubmit = (val: string) => {
    const v = val.trim();
    if (step === 1) {
      if (!v) return;
      setUserName(v);
      collectedName.current = v;
      setLog((l) => [...l, `\u2713 Name: ${v}`]);
      setInput("");
      setStep(2);
    } else if (step === 2) {
      if (!v) return;
      setOllamaUrl(v);
      setLog((l) => [...l, `\u2713 Ollama: ${v}`]);
      setInput("");
      setStep(3);
    } else if (step === 4) {
      const gb = Number(v);
      if (gb > 0) setVramGb(gb);
      setLog((l) => [...l, `\u2713 VRAM: ${v || "default"}`]);
      setInput("");
      setStep(5);
    } else if (step === 5) {
      if (v) setTavilyKey(v);
      setLog((l) => [...l, `\u2713 Tavily: ${v ? "configured" : "skipped"}`]);
      setInput("");
      setStep(6);
    } else if (step === 6) {
      if (v) setExchangeRateApiKey(v);
      setLog((l) => [...l, `\u2713 Exchange Rate: ${v ? "configured" : "skipped"}`]);
      setInput("");
      setStep(7);
    } else if (step === 8) {
      if (!v) return;
      setOpenAiKey(v);
      setLog((l) => [...l, "\u2713 OpenAI key: configured"]);
      setInput("");
      setStep(9);
    } else if (step === 9) {
      const model = v || "gpt-5.2";
      setOpenAiModel(model);
      setLog((l) => [...l, `\u2713 OpenAI model: ${model}`]);
      setInput("");
      setSetupDone();
      onComplete(collectedName.current);
    }
  };

  const displayed = SETUP_FULL.slice(0, typed);
  // Flowing inference wave
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
      {typingDone && !loading && step !== 3 && step !== 7 && STEP_PROMPTS[step] && (
        <Box marginTop={1}>
          <Text color="yellow" bold>{`  ${STEP_PROMPTS[step]}`}</Text>
          <TextInput value={input} onChange={setInput} onSubmit={handleSubmit} />
        </Box>
      )}
      {typingDone && step === 7 && (
        <Box marginTop={1}>
          <Text color="yellow" bold>{"  Enable ultrathink mode? (cloud AI for complex reasoning) "}</Text>
          <Text dimColor>(y/n)</Text>
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
            <Text key={m} color={i === modelIdx ? "cyan" : undefined} bold={i === modelIdx}>
              {"  "}{i === modelIdx ? "\u276F " : "  "}{m}
            </Text>
          ))}
        </Box>
      )}
    </Box>
  );
}
