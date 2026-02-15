import React, { useState, useCallback, useRef } from "react";
import { Box, Text, Static, useApp, useInput } from "ink";
import Spinner from "ink-spinner";
import TextInput from "ink-text-input";
import { spawn, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { runAgent, type AgentStatus } from "../agent";
import { config, setModel, setUserName, setOpenAiKey, onboardingStep } from "../config";
import { optimizeContext } from "../context";
import { listModels, getModelInfo, type OllamaMessage } from "../ollama";
import { CLOUD_THINK_REGEX } from "../tools/cloud-think";
import { timestamp } from "../utils";
import { handleNewCommand, handleCompactCommand } from "../commands";
import { Markdown } from "./Markdown";
import { ModelPicker } from "./ModelPicker";
import { Welcome } from "./Welcome";
import { ContextBar } from "./ContextBar";
import { HighlightCloudThink } from "./HighlightCloudThink";
import { SetupWelcome } from "./SetupWelcome";

import { storeDir, systemPromptPath, rulesPath } from "../store";

const defaultPromptPath = path.resolve(import.meta.dir, "../../system-prompt.txt");

function getSystemPrompt(): OllamaMessage {
  // Seed system prompt into config dir if missing
  fs.mkdirSync(storeDir, { recursive: true });
  if (!fs.existsSync(systemPromptPath)) {
    fs.copyFileSync(defaultPromptPath, systemPromptPath);
  }
  let content = fs.readFileSync(systemPromptPath, "utf-8");
  // Append user rules if they exist
  if (fs.existsSync(rulesPath)) {
    content += "\n\n## User Rules\n" + fs.readFileSync(rulesPath, "utf-8");
  }
  return { role: "system", content };
}

interface DisplayMessage {
  id: number;
  role: "user" | "assistant" | "tool" | "error" | "system" | "shell";
  content: string;
  model?: string;
}

interface ToolEntry {
  name: string;
  args: string;
  done: boolean;
}

let nextId = 0;

export function App() {
  const { exit } = useApp();
  const [history, setHistory] = useState<DisplayMessage[]>([]);
  const agentMsgs = useRef<OllamaMessage[]>([]);
  const [thinking, setThinking] = useState(false);
  const [tools, setTools] = useState<ToolEntry[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [tokenCount, setTokenCount] = useState(0);
  const lastTokens = useRef({ prompt: 0, completion: 0 });
  const startTime = useRef(0);
  const toolTimeMs = useRef(0);
  const toolStartAt = useRef(0);
  const [streamText, setStreamText] = useState("");
  const [modelList, setModelList] = useState<string[] | null>(null);
  const [modelLoading, setModelLoading] = useState(false);
  const [verbose, setVerbose] = useState(false);
  const [shellMode, setShellMode] = useState(false);
  const [shellOutput, setShellOutput] = useState("");
  const shellProc = useRef<ChildProcess | null>(null);
  const [userName, setUserNameState] = useState(config.userName);
  const [mePrompt, setMePrompt] = useState(false);
  const [meInput, setMeInput] = useState("");

  // Onboarding flow: 0 = done, 1-6 = setup steps (handled by SetupWelcome)
  const [onboardStep, setOnboardStep] = useState<0 | 1 | 2 | 3 | 4 | 5 | 6>(onboardingStep());

  // OpenAI key prompt (triggered when cloudthink used without key)
  const [apiKeyPrompt, setApiKeyPrompt] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const pendingCloudMsg = useRef<string | null>(null);

  // Ctrl+O toggles verbose tool output, Shift+Tab toggles shell mode, Ctrl+C kills shell proc
  useInput((_input, key) => {
    if (key.ctrl && _input === "o") {
      setVerbose((v) => !v);
    }
    if (key.shift && key.tab) {
      setShellMode((v) => {
        const next = !v;
        setHistory((h) => [...h, {
          id: nextId++, role: "system",
          content: next ? "Shell mode enabled." : "Shell mode disabled.",
        }]);
        return next;
      });
    }
    if (_input === "\x03") {
      exit();
    }
    if (key.escape && shellProc.current) {
      shellProc.current.kill("SIGINT");
    }
  });

  // Clean dragged file paths: strip surrounding quotes and backslash escapes
  const handleChange = useCallback((value: string) => {
    setInput(value.replace(/^['"]|['"]$/g, "").replace(/\\ /g, " "));
  }, []);

  const handleSubmit = useCallback(
    async (value: string) => {
      const trimmed = value.trim();
      if (!trimmed || busy) return;

      if (trimmed === "exit" || trimmed === "quit") {
        exit();
        return;
      }

      if (trimmed === "/new") {
        const { systemMessage } = handleNewCommand(agentMsgs.current);
        setTokenCount(0);
        setHistory((h) => [
          ...h,
          { id: nextId++, role: "system", content: systemMessage! },
        ]);
        setInput("");
        return;
      }

      if (trimmed === "/model") {
        setInput("");
        setModelLoading(true);
        try {
          const models = await listModels();
          setModelList(models);
        } catch (err) {
          setHistory((h) => [
            ...h,
            {
              id: nextId++,
              role: "error",
              content: `Failed to fetch models: ${err instanceof Error ? err.message : String(err)}`,
            },
          ]);
        }
        setModelLoading(false);
        return;
      }

      if (trimmed === "/me") {
        setInput("");
        setMeInput(userName);
        setMePrompt(true);
        return;
      }

      if (trimmed === "/compact") {
        setInput("");
        setBusy(true);
        setHistory((h) => [
          ...h,
          { id: nextId++, role: "system", content: "Compacting context..." },
        ]);
        const { messages, result } = await handleCompactCommand(agentMsgs.current);
        agentMsgs.current = messages;
        if (result.systemMessage) {
          setHistory((h) => [
            ...h,
            { id: nextId++, role: "system", content: result.systemMessage! },
          ]);
        }
        if (result.errorMessage) {
          setHistory((h) => [
            ...h,
            { id: nextId++, role: "error", content: result.errorMessage! },
          ]);
        }
        setBusy(false);
        return;
      }

      // Shell mode: execute command with live streaming output
      if (shellMode) {
        setInput("");
        setBusy(true);
        setShellOutput("");
        setHistory((h) => [...h, { id: nextId++, role: "shell", content: `$ ${trimmed}` }]);

        let output = "";
        const truncated = () => output.length > 4000;

        try {
          const proc = spawn(trimmed, { shell: true });
          shellProc.current = proc;

          const onData = (chunk: Buffer) => {
            if (truncated()) return;
            const text = chunk.toString();
            output += text;
            if (truncated()) {
              output = output.slice(0, 4000);
              setShellOutput(output + "\n... (truncated)");
            } else {
              setShellOutput(output);
            }
          };

          proc.stdout?.on("data", onData);
          proc.stderr?.on("data", onData);

          const exitCode = await new Promise<number>((resolve) => {
            proc.on("close", (code) => resolve(code ?? 0));
            proc.on("error", (err) => {
              output += err.message;
              setShellOutput(output);
              resolve(1);
            });
          });

          shellProc.current = null;
          setShellOutput("");

          const display = truncated() ? output.slice(0, 4000) + "\n... (truncated)" : output;
          const exitInfo = exitCode !== 0 ? `\n[exit code: ${exitCode}]` : "";
          setHistory((h) => [...h, { id: nextId++, role: "shell", content: (display || "(no output)") + exitInfo }]);
          agentMsgs.current.push({
            role: "user",
            content: `[Shell] $ ${trimmed}\n${display}${exitInfo}`,
          });
        } catch (err) {
          shellProc.current = null;
          setShellOutput("");
          setHistory((h) => [...h, { id: nextId++, role: "error", content: err instanceof Error ? err.message : String(err) }]);
        }
        setBusy(false);
        return;
      }

      // If cloudthink is triggered and no OpenAI key, prompt for it
      const isCloudThink = new RegExp(CLOUD_THINK_REGEX.source, "gi").test(trimmed);
      if (isCloudThink && !config.openai.apiKey) {
        setInput("");
        pendingCloudMsg.current = trimmed;
        setApiKeyInput("");
        setApiKeyPrompt(true);
        return;
      }

      setInput("");
      setBusy(true);
      setThinking(true);
      setTools([]);
      setStreamText("");
      startTime.current = Date.now();
      lastTokens.current = { prompt: 0, completion: 0 };
      toolTimeMs.current = 0;
      toolStartAt.current = 0;

      setHistory((h) => [
        ...h,
        { id: nextId++, role: "user", content: trimmed },
      ]);

      // Stable system prompt + conversation history + timestamped user message
      const userMsg: OllamaMessage = {
        role: "user",
        content: `[${timestamp()}] ${trimmed}`,
      };
      agentMsgs.current.push(userMsg);
      const fullMsgs: OllamaMessage[] = [
        getSystemPrompt(),
        ...agentMsgs.current,
      ];

      try {
        const reply = await runAgent(fullMsgs, (s: AgentStatus) => {
          if (s.type === "thinking") {
            setThinking(true);
            setStreamText("");
          } else if (s.type === "stream") {
            setThinking(false);
            setStreamText((prev) => prev + s.token);
          } else if (s.type === "tool") {
            setThinking(false);
            setStreamText("");
            toolStartAt.current = Date.now();
            setTools((t) => [
              ...t,
              { name: s.name, args: s.args, done: false },
            ]);
          } else if (s.type === "tool_done") {
            if (toolStartAt.current > 0) {
              toolTimeMs.current += Date.now() - toolStartAt.current;
              toolStartAt.current = 0;
            }
            setTools((t) =>
              t.map((entry) =>
                entry.name === s.name &&
                entry.args === s.args &&
                !entry.done
                  ? { ...entry, done: true }
                  : entry
              )
            );
          } else if (s.type === "tokens") {
            lastTokens.current = { prompt: s.prompt, completion: s.completion };
            setTokenCount(s.prompt + s.completion);
          }
        });

        // Clear streaming text — response moves to history
        setStreamText("");

        // Snapshot tool log + response into history
        setTools((currentTools) => {
          const newEntries: DisplayMessage[] = currentTools.map((t) => ({
            id: nextId++,
            role: "tool" as const,
            content: `${t.name} -> ${t.args}`,
          }));
          newEntries.push({
            id: nextId++,
            role: "assistant",
            content: reply,
            ...(isCloudThink && { model: config.openai.model }),
          });
          const elapsedMs = Date.now() - startTime.current;
          const genMs = Math.max(elapsedMs - toolTimeMs.current, 1);
          const elapsed = (elapsedMs / 1000).toFixed(1);
          const { prompt: pTok, completion: cTok } = lastTokens.current;
          const tps = (cTok / (genMs / 1000)).toFixed(1);
          newEntries.push({
            id: nextId++,
            role: "system",
            content: `${elapsed}s · ${pTok} in · ${cTok} out · ${tps} tok/s`,
          });
          setHistory((h) => [...h, ...newEntries]);
          return [];
        });

        // Sync agent messages with what the agent mutated (includes tool calls)
        agentMsgs.current = fullMsgs.slice(1);
        agentMsgs.current.push({ role: "assistant", content: reply });

        // Auto-optimize context when approaching limit
        const { messages: optimized, optimized: didOptimize } =
          await optimizeContext(agentMsgs.current, tokenCount);
        if (didOptimize) {
          agentMsgs.current = optimized;
          setHistory((h) => [
            ...h,
            {
              id: nextId++,
              role: "system",
              content: "Context optimized to free up space.",
            },
          ]);
        }
      } catch (err) {
        setStreamText("");
        setHistory((h) => [
          ...h,
          {
            id: nextId++,
            role: "error",
            content: err instanceof Error ? err.message : String(err),
          },
        ]);
        setTools([]);
      }

      setThinking(false);
      setBusy(false);
    },
    [busy, exit, userName, shellMode]
  );

  return (
    <Box flexDirection="column">
      {history.length === 0 && !busy && onboardStep === 0 && <Welcome />}

      <Static items={history}>
        {(msg) => (
          <Box key={msg.id} flexDirection="column" marginTop={msg.role === "tool" ? 0 : 1}>
            {msg.role === "user" && (
              <Text>
                <Text color="cyan" bold>
                  {`${userName}> `}
                </Text>
                <HighlightCloudThink text={msg.content} />
              </Text>
            )}
            {msg.role === "tool" && (
              verbose ? (
                <Text>
                  <Text color="green">{msg.content}</Text>
                </Text>
              ) : (
                <Text>
                  <Text color="gray">{"● "}</Text>
                  <Text color="green">{msg.content.split(" -> ")[0]}</Text>
                </Text>
              )
            )}
            {msg.role === "assistant" && (
              <Box flexDirection="column">
                <Text color={msg.model ? "magenta" : "green"} bold>{msg.model ?? config.ollama.model}{">"} </Text>
                <Markdown content={msg.content} />
              </Box>
            )}
            {msg.role === "shell" && <Text color="yellow">{msg.content}</Text>}
            {msg.role === "error" && <Text color="red">{msg.content}</Text>}
            {msg.role === "system" && <Text dimColor>{msg.content}</Text>}
          </Box>
        )}
      </Static>

      {/* Live tool spinners */}
      {tools.map((t, i) => (
        <Box key={i}>
          {t.done ? (
            <Text>
              <Text color="green">{t.name}</Text>
              {verbose && <Text dimColor>{" -> "}{t.args}</Text>}
            </Text>
          ) : (
            <Text>
              <Text color="green">
                <Spinner type="dots" />
              </Text>
              {" "}<Text color="green">{t.name}</Text>
              {verbose && <Text dimColor>{" -> "}{t.args}</Text>}
            </Text>
          )}
        </Box>
      ))}

      {/* Thinking spinner */}
      {thinking && (
        <Text color="yellow">
          <Spinner type="line" />
        </Text>
      )}

      {/* Live shell output */}
      {shellOutput && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="yellow">{shellOutput}</Text>
          <Text dimColor>ESC to cancel</Text>
        </Box>
      )}

      {/* Streaming response */}
      {streamText && (
        <Box flexDirection="column">
          <Text color="green" bold>{config.ollama.model}{">"} </Text>
          <Markdown content={streamText} />
        </Box>
      )}

      {/* Model loading */}
      {modelLoading && (
        <Text color="yellow">
          <Spinner type="line" /> Fetching models...
        </Text>
      )}

      {/* Model picker */}
      {modelList && (
        <ModelPicker
          models={modelList}
          current={config.ollama.model}
          onSelect={async (model) => {
            setModelList(null);
            setModelLoading(true);
            const info = await getModelInfo(model);
            const numCtx = info?.numCtx ?? config.ollama.numCtx;
            const sizeGb = info ? (info.sizeBytes / 1024 ** 3).toFixed(1) : "?";
            setModel(model, numCtx);
            setTokenCount(0);
            setModelLoading(false);
            const msgs: DisplayMessage[] = [
              {
                id: nextId++,
                role: "system",
                content: `Model switched to ${model} (size: ${sizeGb}GB, ctx: ${numCtx.toLocaleString()})`,
              },
            ];
            if (info?.warning) {
              msgs.push({
                id: nextId++,
                role: "error",
                content: info.warning,
              });
            }
            setHistory((h) => [...h, ...msgs]);
          }}
          onCancel={() => setModelList(null)}
        />
      )}

      {/* Onboarding */}
      {onboardStep !== 0 && (
        <SetupWelcome
          initialStep={onboardStep as 1 | 2 | 3 | 4 | 5 | 6}
          onComplete={(name) => {
            setUserNameState(name);
            setOnboardStep(0);
          }}
        />
      )}

      {/* OpenAI API key prompt */}
      {apiKeyPrompt && (
        <Box marginTop={1}>
          <Text color="yellow" bold>OpenAI API key required for cloudthink. Enter key: </Text>
          <TextInput
            value={apiKeyInput}
            onChange={setApiKeyInput}
            onSubmit={(val) => {
              const key = val.trim();
              setApiKeyPrompt(false);
              setApiKeyInput("");
              if (key) {
                setOpenAiKey(key);
                setHistory((h) => [
                  ...h,
                  { id: nextId++, role: "system", content: "OpenAI API key saved." },
                ]);
                // Re-submit the pending message
                if (pendingCloudMsg.current) {
                  const msg = pendingCloudMsg.current;
                  pendingCloudMsg.current = null;
                  handleSubmit(msg);
                }
              } else {
                pendingCloudMsg.current = null;
                setHistory((h) => [
                  ...h,
                  { id: nextId++, role: "error", content: "No API key provided. Cloudthink cancelled." },
                ]);
              }
            }}
          />
        </Box>
      )}

      {/* /me name prompt */}
      {mePrompt && (
        <Box marginTop={1}>
          <Text color="yellow" bold>Enter your name: </Text>
          <TextInput
            value={meInput}
            onChange={setMeInput}
            onSubmit={(val) => {
              const name = val.trim();
              if (name) {
                setUserName(name);
                setUserNameState(name);
                setHistory((h) => [
                  ...h,
                  { id: nextId++, role: "system", content: `Name set to ${name}` },
                ]);
              }
              setMePrompt(false);
              setMeInput("");
            }}
          />
        </Box>
      )}

      {/* Input */}
      {!busy && !modelList && !modelLoading && !mePrompt && !apiKeyPrompt && onboardStep === 0 && (
        <Box marginTop={1}>
          <Text color={shellMode ? "yellow" : "cyan"} bold>
            {shellMode ? "$ " : `${userName}> `}
          </Text>
          <TextInput
            value={input}
            onChange={handleChange}
            onSubmit={handleSubmit}
          />
        </Box>
      )}

      {/* Context usage bar — always visible */}
      <Box borderStyle="single" borderColor="gray" borderBottom={false} borderLeft={false} borderRight={false} paddingTop={0}>
        <ContextBar used={tokenCount} max={config.ollama.numCtx} />
        <Text dimColor>{" "}[^O: {verbose ? "verbose" : "compact"}] [⇧Tab: {shellMode ? "shell" : "chat"}]</Text>
      </Box>
    </Box>
  );
}
