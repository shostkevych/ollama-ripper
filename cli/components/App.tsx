import React, { useState, useCallback, useRef, useEffect } from "react";
import { Box, Text, Static, useApp, useInput } from "ink";
import Spinner from "ink-spinner";
import TextInput from "ink-text-input";
import { spawn, type ChildProcess } from "node:child_process";
import * as api from "../client/api";
import { AuthError } from "../client/api";
import { parseSSE } from "../client/sse";
import { getServerUrl, getToken, clearToken, saveClientConfig } from "../client/store";
import { Markdown } from "./Markdown";
import { ModelPicker } from "./ModelPicker";
import { Welcome } from "./Welcome";
import { ContextBar } from "./ContextBar";
import { HighlightCloudThink } from "./HighlightCloudThink";
import { SetupWelcome } from "./SetupWelcome";
import { ServerPicker } from "./ServerPicker";
import { AddServerForm } from "./AddServerForm";
import { ToolPicker } from "./ToolPicker";
import { NewToolFlow } from "./NewToolFlow";
import { HistoryPicker } from "./HistoryPicker";
import { AskUserDialog } from "./AskUserDialog";
import { PairingFlow } from "./PairingFlow";

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
  const [modelList, setModelList] = useState<{ name: string; size: number }[] | null>(null);
  const [modelLoading, setModelLoading] = useState(false);
  const [verbose, setVerbose] = useState(false);
  const [shellMode, setShellMode] = useState(false);
  const [shellOutput, setShellOutput] = useState("");
  const shellProc = useRef<ChildProcess | null>(null);
  const [mePrompt, setMePrompt] = useState(false);
  const [meInput, setMeInput] = useState("");
  const [serverPickerOpen, setServerPickerOpen] = useState(false);
  const [addServerOpen, setAddServerOpen] = useState(false);
  const [toolPickerOpen, setToolPickerOpen] = useState(false);
  const [vramPrompt, setVramPrompt] = useState(false);
  const [vramInput, setVramInput] = useState("");
  const [newToolOpen, setNewToolOpen] = useState(false);
  const [anthropicKeyPrompt, setAnthropicKeyPrompt] = useState(false);
  const [anthropicKeyInput, setAnthropicKeyInput] = useState("");
  const [cloudModelPrompt, setCloudModelPrompt] = useState(false);
  const [cloudModelInput, setCloudModelInput] = useState("");
  const cloudSetupPending = useRef(false);
  const [historyPickerOpen, setHistoryPickerOpen] = useState(false);
  const [savedConversations, setSavedConversations] = useState<{ id: number; title: string; summary: string; model: string; created_at: string }[]>([]);
  const hideNextUserMsg = useRef(false);
  const [cloudMode, setCloudMode] = useState(false);
  const [askDialog, setAskDialog] = useState<{
    id: string;
    model: string;
    question: string;
    options: string[];
  } | null>(null);

  // Interview state
  const [interviewActive, setInterviewActive] = useState(false);
  const [interviewTopicPrompt, setInterviewTopicPrompt] = useState(false);
  const [interviewTopic, setInterviewTopic] = useState("");
  const [interviewStatus, setInterviewStatus] = useState("");
  const interviewStopping = useRef(false);

  // Input history
  const inputHistory = useRef<string[]>([]);
  const historyIndex = useRef(-1);
  const savedInput = useRef("");

  // Connection & auth state
  const [phase, setPhase] = useState<"connecting" | "pairing" | "validating" | "setup" | "ready">("connecting");
  const [onboardStep, setOnboardStep] = useState(0);

  // Config fetched from server
  const [serverConfig, setServerConfig] = useState<Record<string, any>>({});
  const userName = serverConfig.userName || "";
  const currentModel = (serverConfig.ollama as any)?.model || "";
  const numCtx = (serverConfig.ollama as any)?.numCtx || 32768;
  const activeServer = serverConfig.activeServer || "";
  const cloudModel = (serverConfig.anthropic as any)?.model || "claude-opus-4-6";

  const [modelReady, setModelReady] = useState(false);
  const [wakingUp, setWakingUp] = useState(false);
  const [wakeWord, setWakeWord] = useState("");

  const inputActive = !busy && !modelList && !modelLoading && !wakingUp && !mePrompt && !anthropicKeyPrompt && !cloudModelPrompt && !vramPrompt && !serverPickerOpen && !addServerOpen && !toolPickerOpen && !newToolOpen && !historyPickerOpen && !askDialog && !interviewActive && !interviewTopicPrompt && phase === "ready";

  // Startup: connect → validate → setup check
  useEffect(() => {
    (async () => {
      // 1. Wait for server
      setPhase("connecting");
      while (true) {
        if (await api.checkHealth()) break;
        await new Promise((r) => setTimeout(r, 3000));
      }

      // 2. Check token
      const token = getToken();
      if (!token) {
        setPhase("pairing");
        return;
      }

      // 3. Validate token
      setPhase("validating");
      try {
        const cfg = await api.getConfig();
        setServerConfig(cfg);
      } catch (err) {
        if (err instanceof AuthError) {
          clearToken();
          setPhase("pairing");
          return;
        }
      }

      // 4. Check setup
      try {
        const { step } = await api.getSetupStatus();
        if (step > 0) {
          setOnboardStep(step);
          setPhase("setup");
          return;
        }
      } catch {}

      setPhase("ready");
      setModelReady(true);
      setWakeWord("Ready");
    })();
  }, []);

  const handlePaired = useCallback(async (token: string) => {
    try {
      const cfg = await api.getConfig();
      setServerConfig(cfg);
      const { step } = await api.getSetupStatus();
      if (step > 0) {
        setOnboardStep(step);
        setPhase("setup");
      } else {
        setPhase("ready");
        setModelReady(true);
        setWakeWord("Ready");
      }
    } catch {
      setPhase("ready");
      setModelReady(true);
      setWakeWord("Ready");
    }
  }, []);

  // Keyboard shortcuts
  useInput((_input, key) => {
    if (key.ctrl && _input === "o") setVerbose((v) => !v);
    if (key.shift && key.tab) {
      setShellMode((v) => {
        const next = !v;
        setHistory((h) => [...h, { id: nextId++, role: "system", content: next ? "Shell mode enabled." : "Shell mode disabled." }]);
        return next;
      });
    }
    if (_input === "\x03") {
      if (interviewActive) {
        api.stopInterview(false).catch(() => {});
      }
      exit();
      process.exit(0);
    }
    if (key.escape && interviewActive && !interviewStopping.current) {
      interviewStopping.current = true;
      setInterviewStatus("Scoring interview...");
      api.stopInterview(true).catch(() => {});
    }
    if (key.escape && shellProc.current) {
      shellProc.current.kill("SIGINT");
    }
    if (inputActive && key.upArrow && inputHistory.current.length > 0) {
      if (historyIndex.current === -1) savedInput.current = input;
      const next = Math.min(historyIndex.current + 1, inputHistory.current.length - 1);
      historyIndex.current = next;
      setInput(inputHistory.current[inputHistory.current.length - 1 - next]);
    }
    if (inputActive && key.downArrow) {
      if (historyIndex.current <= 0) {
        historyIndex.current = -1;
        setInput(savedInput.current);
      } else {
        historyIndex.current -= 1;
        setInput(inputHistory.current[inputHistory.current.length - 1 - historyIndex.current]);
      }
    }
  });

  const handleChange = useCallback((value: string) => {
    setInput(value.replace(/^['"]|['"]$/g, "").replace(/\\ /g, " "));
  }, []);

  const handleSubmit = useCallback(
    async (value: string) => {
      const trimmed = value.trim();
      if (!trimmed || busy) return;

      inputHistory.current.push(trimmed);
      historyIndex.current = -1;
      savedInput.current = "";

      if (trimmed === "exit" || trimmed === "quit" || trimmed === "done" || trimmed === "bye") {
        if (interviewActive) {
          api.stopInterview(false).catch(() => {});
        }
        exit();
        process.exit(0);
      }

      if (trimmed === "/new") {
        setInput("");
        setBusy(true);
        try {
          await api.postChatNew();
          setTokenCount(0);
          setHistory((h) => [...h, { id: nextId++, role: "system", content: "Conversation cleared." }]);
        } catch (err) {
          setHistory((h) => [...h, { id: nextId++, role: "error", content: err instanceof Error ? err.message : String(err) }]);
        }
        setBusy(false);
        return;
      }

      if (trimmed === "/mode") {
        setInput("");
        setCloudMode((v) => {
          const next = !v;
          setHistory((h) => [...h, { id: nextId++, role: "system", content: next ? `Cloud mode enabled (${cloudModel}).` : "Cloud mode disabled (local)." }]);
          return next;
        });
        return;
      }

      if (trimmed === "/model") {
        setInput("");
        setModelLoading(true);
        try {
          const models = await api.getModels();
          setModelList(models);
        } catch (err) {
          setHistory((h) => [...h, { id: nextId++, role: "error", content: `Failed to fetch models: ${err instanceof Error ? err.message : String(err)}` }]);
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

      if (trimmed === "/server") {
        setInput("");
        setServerPickerOpen(true);
        return;
      }

      if (trimmed === "/vram") {
        setInput("");
        const currentVram = Math.round(((serverConfig.ollama as any)?.vramBytes ?? 16 * 1024 ** 3) / 1024 ** 3);
        setVramInput(String(currentVram));
        setVramPrompt(true);
        return;
      }

      if (trimmed === "/tools") {
        setInput("");
        setToolPickerOpen(true);
        return;
      }

      if (trimmed === "/cloud") {
        setInput("");
        cloudSetupPending.current = true;
        if (!(serverConfig.anthropic as any)?.apiKey) {
          setAnthropicKeyInput("");
          setAnthropicKeyPrompt(true);
        } else {
          setCloudModelInput(cloudModel);
          setCloudModelPrompt(true);
        }
        return;
      }

      if (trimmed === "/newtool") {
        setInput("");
        setNewToolOpen(true);
        return;
      }

      if (trimmed === "/compact") {
        setInput("");
        setBusy(true);
        setHistory((h) => [...h, { id: nextId++, role: "system", content: "Compacting context..." }]);
        try {
          const result = await api.postChatCompact();
          if (result.systemMessage) setHistory((h) => [...h, { id: nextId++, role: "system", content: result.systemMessage! }]);
          if (result.errorMessage) setHistory((h) => [...h, { id: nextId++, role: "error", content: result.errorMessage! }]);
        } catch (err) {
          setHistory((h) => [...h, { id: nextId++, role: "error", content: err instanceof Error ? err.message : String(err) }]);
        }
        setBusy(false);
        return;
      }

      if (trimmed === "/save") {
        setInput("");
        setBusy(true);
        setHistory((h) => [...h, { id: nextId++, role: "system", content: "Saving conversation..." }]);
        try {
          const result = await api.postChatSave();
          if (result.systemMessage) setHistory((h) => [...h, { id: nextId++, role: "system", content: result.systemMessage! }]);
          if (result.errorMessage) setHistory((h) => [...h, { id: nextId++, role: "error", content: result.errorMessage! }]);
        } catch (err) {
          setHistory((h) => [...h, { id: nextId++, role: "error", content: `Save failed: ${err instanceof Error ? err.message : String(err)}` }]);
        }
        setBusy(false);
        return;
      }

      if (trimmed === "/history") {
        setInput("");
        try {
          const convos = await api.getConversations();
          setSavedConversations(convos);
          setHistoryPickerOpen(true);
        } catch (err) {
          setHistory((h) => [...h, { id: nextId++, role: "error", content: err instanceof Error ? err.message : String(err) }]);
        }
        return;
      }

      if (trimmed === "/interview") {
        setInput("");
        setInterviewTopic("");
        setInterviewTopicPrompt(true);
        return;
      }

      if (trimmed.startsWith("/schedule")) {
        setInput("");
        setBusy(true);
        const parts = trimmed.replace("/schedule", "").trim().split(/\s+/).filter(Boolean);
        const sub = parts[0];
        try {
          if (sub === "list" || !sub) {
            const schedules = await api.getSchedules() as any[];
            if (!schedules.length) {
              setHistory((h) => [...h, { id: nextId++, role: "system", content: "No schedules." }]);
            } else {
              const lines = schedules.map((s: any) => {
                const status = s.enabled ? "active" : "paused";
                return `#${s.id} [${status}] ${s.schedule_expr} — "${(s.prompt as string).slice(0, 60)}"`;
              });
              setHistory((h) => [...h, { id: nextId++, role: "system", content: lines.join("\n") }]);
            }
          } else if (sub === "add") {
            const rest = parts.slice(1).join(" ");
            const quotedMatch = rest.match(/^(.+?)\s+"(.+)"$/);
            if (!quotedMatch) {
              setHistory((h) => [...h, { id: nextId++, role: "error", content: 'Usage: /schedule add every 3m "your prompt here"' }]);
            } else {
              const [, expr, prompt] = quotedMatch;
              const schedule = await api.addSchedule(prompt, expr.trim()) as any;
              setHistory((h) => [...h, { id: nextId++, role: "system", content: `Schedule #${schedule.id} created. Next run: ${schedule.next_run}` }]);
            }
          } else if (sub === "remove") {
            const id = parseInt(parts[1], 10);
            if (isNaN(id)) { setHistory((h) => [...h, { id: nextId++, role: "error", content: "Usage: /schedule remove <id>" }]); }
            else { await api.removeSchedule(id); setHistory((h) => [...h, { id: nextId++, role: "system", content: `Schedule #${id} removed.` }]); }
          } else if (sub === "pause") {
            const id = parseInt(parts[1], 10);
            if (isNaN(id)) { setHistory((h) => [...h, { id: nextId++, role: "error", content: "Usage: /schedule pause <id>" }]); }
            else { await api.patchSchedule(id, false); setHistory((h) => [...h, { id: nextId++, role: "system", content: `Schedule #${id} paused.` }]); }
          } else if (sub === "resume") {
            const id = parseInt(parts[1], 10);
            if (isNaN(id)) { setHistory((h) => [...h, { id: nextId++, role: "error", content: "Usage: /schedule resume <id>" }]); }
            else { await api.patchSchedule(id, true); setHistory((h) => [...h, { id: nextId++, role: "system", content: `Schedule #${id} resumed.` }]); }
          } else {
            setHistory((h) => [...h, { id: nextId++, role: "error", content: "Unknown subcommand. Use: add, list, remove, pause, resume" }]);
          }
        } catch (err) {
          setHistory((h) => [...h, { id: nextId++, role: "error", content: `Schedule error: ${err instanceof Error ? err.message : String(err)}` }]);
        }
        setBusy(false);
        return;
      }

      // Shell mode
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
            if (truncated()) { output = output.slice(0, 4000); setShellOutput(output + "\n... (truncated)"); }
            else setShellOutput(output);
          };
          proc.stdout?.on("data", onData);
          proc.stderr?.on("data", onData);
          const exitCode = await new Promise<number>((resolve) => {
            proc.on("close", (code) => resolve(code ?? 0));
            proc.on("error", (err) => { output += err.message; setShellOutput(output); resolve(1); });
          });
          shellProc.current = null;
          setShellOutput("");
          const display = truncated() ? output.slice(0, 4000) + "\n... (truncated)" : output;
          const exitInfo = exitCode !== 0 ? `\n[exit code: ${exitCode}]` : "";
          setHistory((h) => [...h, { id: nextId++, role: "shell", content: (display || "(no output)") + exitInfo }]);
        } catch (err) {
          shellProc.current = null;
          setShellOutput("");
          setHistory((h) => [...h, { id: nextId++, role: "error", content: err instanceof Error ? err.message : String(err) }]);
        }
        setBusy(false);
        return;
      }

      // Chat via SSE
      setInput("");
      setBusy(true);
      setThinking(true);
      setTools([]);
      setStreamText("");
      startTime.current = Date.now();
      lastTokens.current = { prompt: 0, completion: 0 };
      toolTimeMs.current = 0;
      toolStartAt.current = 0;

      if (hideNextUserMsg.current) {
        hideNextUserMsg.current = false;
      } else {
        setHistory((h) => [...h, { id: nextId++, role: "user", content: trimmed }]);
      }

      try {
        const response = await api.postChat(trimmed, cloudMode || undefined);
        if (!response.ok) {
          const data = await response.json().catch(() => ({})) as any;
          throw new Error(data.error ?? `HTTP ${response.status}`);
        }

        let fullReply = "";
        let replyModel = "";

        for await (const { event, data } of parseSSE(response)) {
          const d = data as any;
          switch (event) {
            case "thinking":
              setThinking(true);
              setStreamText("");
              break;
            case "token":
              setThinking(false);
              setStreamText((prev) => prev + d.text);
              break;
            case "tool_start":
              setThinking(false);
              setStreamText("");
              toolStartAt.current = Date.now();
              setTools((t) => [...t, { name: d.name, args: d.args, done: false }]);
              break;
            case "tool_done":
              if (toolStartAt.current > 0) { toolTimeMs.current += Date.now() - toolStartAt.current; toolStartAt.current = 0; }
              setTools((t) => t.map((entry) => entry.name === d.name && entry.args === d.args && !entry.done ? { ...entry, done: true } : entry));
              break;
            case "tokens":
              lastTokens.current = { prompt: d.prompt, completion: d.completion };
              setTokenCount(d.prompt + d.completion);
              break;
            case "ask_user":
              setAskDialog({ id: d.id, model: cloudMode ? cloudModel : currentModel, question: d.question, options: d.options ?? [] });
              break;
            case "done":
              fullReply = d.content;
              replyModel = d.model;
              break;
            case "error":
              throw new Error(d.message);
            case "ping":
              break;
          }
        }

        setStreamText("");
        setTools((currentTools) => {
          const newEntries: DisplayMessage[] = currentTools.map((t) => ({
            id: nextId++, role: "tool" as const, content: `${t.name} -> ${t.args}`,
          }));
          newEntries.push({ id: nextId++, role: "assistant", content: fullReply, model: replyModel || undefined });
          const elapsedMs = Date.now() - startTime.current;
          const genMs = Math.max(elapsedMs - toolTimeMs.current, 1);
          const elapsed = (elapsedMs / 1000).toFixed(1);
          const { prompt: pTok, completion: cTok } = lastTokens.current;
          const tps = (cTok / (genMs / 1000)).toFixed(1);
          newEntries.push({ id: nextId++, role: "system", content: `${elapsed}s · ${pTok} in · ${cTok} out · ${tps} tok/s` });
          setHistory((h) => [...h, ...newEntries]);
          return [];
        });
      } catch (err) {
        setStreamText("");
        setHistory((h) => [...h, { id: nextId++, role: "error", content: err instanceof Error ? err.message : String(err) }]);
        setTools([]);
      }

      setThinking(false);
      setBusy(false);
    },
    [busy, exit, userName, shellMode, cloudMode, currentModel, cloudModel, serverConfig]
  );

  const startInterview = useCallback(async (topic: string) => {
    setInterviewActive(true);
    setInterviewStatus("Starting interview...");
    setHistory((h) => [...h, { id: nextId++, role: "system", content: `Interview: "${topic}" | Escape to stop` }]);

    try {
      const response = await api.postInterview(topic);
      if (!response.ok) throw new Error("Failed to start interview");

      let exchanges = 0;
      for await (const { event, data } of parseSSE(response)) {
        const d = data as any;
        switch (event) {
          case "thinking":
            setInterviewStatus("Interviewer is thinking...");
            break;
          case "question":
            setInterviewStatus(`Round ${d.round}`);
            setHistory((h) => [...h, { id: nextId++, role: "assistant", content: d.question, model: cloudModel }]);
            break;
          case "answering":
            setInterviewStatus("Candidate is answering...");
            break;
          case "answer":
            setHistory((h) => [...h, { id: nextId++, role: "assistant", content: d.answer, model: currentModel }]);
            break;
          case "scoring":
            setInterviewStatus("Scoring interview...");
            break;
          case "error":
            setHistory((h) => [...h, { id: nextId++, role: "error", content: d.message || d.error }]);
            break;
          case "done":
            exchanges = d.exchanges;
            setHistory((h) => [...h,
              { id: nextId++, role: "assistant", content: d.score, model: cloudModel },
              { id: nextId++, role: "system", content: `Interview complete — ${d.exchanges} exchanges` },
            ]);
            break;
        }
      }
    } catch (err) {
      setHistory((h) => [...h, { id: nextId++, role: "error", content: err instanceof Error ? err.message : String(err) }]);
    }

    setInterviewActive(false);
    setInterviewStatus("");
    interviewStopping.current = false;
  }, [cloudModel, currentModel]);

  // Connecting / Pairing / Setup screens
  if (phase === "connecting") {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Text color="yellow"><Spinner type="dots" /> Waiting for server at {getServerUrl()}...</Text>
      </Box>
    );
  }

  if (phase === "pairing") {
    return <PairingFlow serverUrl={getServerUrl()} onPaired={handlePaired} />;
  }

  if (phase === "validating") {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Text color="yellow"><Spinner type="dots" /> Validating session...</Text>
      </Box>
    );
  }

  if (phase === "setup") {
    return (
      <SetupWelcome
        initialStep={onboardStep as 1 | 2 | 3 | 4 | 5 | 6 | 9}
        onComplete={async (name) => {
          try {
            const cfg = await api.getConfig();
            setServerConfig(cfg);
          } catch {}
          setOnboardStep(0);
          setPhase("ready");
          setModelReady(true);
          setWakeWord("Ready");
        }}
      />
    );
  }

  return (
    <Box flexDirection="column">
      {history.length === 0 && !busy && <Welcome ready={modelReady} wakingUp={wakingUp} wakeWord={wakeWord} config={serverConfig} />}

      <Static items={history}>
        {(msg) => (
          <Box key={msg.id} flexDirection="column" marginTop={msg.role === "tool" ? 0 : 1}>
            {msg.role === "user" && (
              <Text>
                <Text color="cyan" bold>{`${userName}> `}</Text>
                <HighlightCloudThink text={msg.content} />
              </Text>
            )}
            {msg.role === "tool" && (
              verbose ? (
                <Text><Text color="green">{msg.content}</Text></Text>
              ) : (
                <Text>
                  <Text color="gray">{"● "}</Text>
                  <Text color="green">{msg.content.split(" -> ")[0]}</Text>
                </Text>
              )
            )}
            {msg.role === "assistant" && (
              <Box flexDirection="column">
                <Text color={msg.model?.startsWith("claude") ? "#DB6A45" : "green"} bold>{msg.model ?? currentModel}{">"} </Text>
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
              <Text color="green"><Spinner type="dots" /></Text>
              {" "}<Text color="green">{t.name}</Text>
              {verbose && <Text dimColor>{" -> "}{t.args}</Text>}
            </Text>
          )}
        </Box>
      ))}

      {thinking && <Text color="yellow"><Spinner type="line" /></Text>}

      {shellOutput && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="yellow">{shellOutput}</Text>
          <Text dimColor>ESC to cancel</Text>
        </Box>
      )}

      {streamText && (
        <Box flexDirection="column">
          <Text color={cloudMode ? "#DB6A45" : "green"} bold>{cloudMode ? cloudModel : currentModel}{">"} </Text>
          <Markdown content={streamText} />
        </Box>
      )}

      {modelLoading && (
        <Text color="yellow">
          <Spinner type="line" /> {modelList === null && !busy ? "Loading model..." : "Fetching models..."}
        </Text>
      )}

      {modelList && (
        <ModelPicker
          models={modelList}
          current={currentModel}
          onSelect={async (model) => {
            setModelList(null);
            setModelLoading(true);
            try {
              const result = await api.switchModel(model);
              setTokenCount(0);
              setServerConfig((c) => ({ ...c, ollama: { ...c.ollama, model: result.model, numCtx: result.numCtx, modelSizeBytes: result.sizeBytes } }));
              const sizeGb = result.sizeBytes ? (result.sizeBytes / 1024 ** 3).toFixed(1) : "?";
              const msgs: DisplayMessage[] = [{ id: nextId++, role: "system", content: `Model switched to ${model} (size: ${sizeGb}GB, ctx: ${result.numCtx.toLocaleString()})` }];
              if (result.warning) msgs.push({ id: nextId++, role: "error", content: result.warning });
              setHistory((h) => [...h, ...msgs]);
            } catch (err) {
              setHistory((h) => [...h, { id: nextId++, role: "error", content: err instanceof Error ? err.message : String(err) }]);
            }
            setModelLoading(false);
          }}
          onCancel={() => setModelList(null)}
        />
      )}

      {serverPickerOpen && (
        <ServerPicker
          servers={(serverConfig.servers as any[]) ?? []}
          activeServer={activeServer}
          onSelect={async (server) => {
            setServerPickerOpen(false);
            try {
              await api.activateServer(server.name);
              const cfg = await api.getConfig();
              setServerConfig(cfg);
              setHistory((h) => [...h, { id: nextId++, role: "system", content: `Switched to server: ${server.name} (${server.url})` }]);
              setModelLoading(true);
              const models = await api.getModels();
              setModelList(models);
            } catch (err) {
              setHistory((h) => [...h, { id: nextId++, role: "error", content: err instanceof Error ? err.message : String(err) }]);
            }
            setModelLoading(false);
          }}
          onAddNew={() => { setServerPickerOpen(false); setAddServerOpen(true); }}
          onCancel={() => setServerPickerOpen(false)}
        />
      )}

      {historyPickerOpen && (
        <HistoryPicker
          conversations={savedConversations}
          onSelect={async (conversation) => {
            setHistoryPickerOpen(false);
            try {
              await api.resumeConversation(conversation.id);
              setHistory((h) => [...h, { id: nextId++, role: "system", content: `Resuming: ${conversation.title}` }]);
            } catch (err) {
              setHistory((h) => [...h, { id: nextId++, role: "error", content: err instanceof Error ? err.message : String(err) }]);
            }
          }}
          onCancel={() => setHistoryPickerOpen(false)}
        />
      )}

      {askDialog && (
        <AskUserDialog
          model={askDialog.model}
          question={askDialog.question}
          options={askDialog.options}
          onAnswer={async (a) => {
            const id = askDialog.id;
            setAskDialog(null);
            try { await api.postChatAnswer(id, a); } catch {}
          }}
          onCancel={() => {
            const id = askDialog.id;
            setAskDialog(null);
            api.postChatAnswer(id, "[User declined to answer]").catch(() => {});
          }}
        />
      )}

      {interviewTopicPrompt && (
        <Box marginTop={1}>
          <Text color="yellow" bold>Interview topic: </Text>
          <TextInput
            value={interviewTopic}
            onChange={setInterviewTopic}
            onSubmit={(val) => {
              const topic = val.trim();
              setInterviewTopicPrompt(false);
              setInterviewTopic("");
              if (topic) startInterview(topic);
              else setHistory((h) => [...h, { id: nextId++, role: "error", content: "No topic provided." }]);
            }}
          />
        </Box>
      )}

      {interviewActive && interviewStatus && (
        <Box marginTop={1}>
          <Text color="yellow"><Spinner type="dots" /> {interviewStatus} (Escape to stop & score)</Text>
        </Box>
      )}

      {addServerOpen && (
        <AddServerForm
          onComplete={async (name, url, vramGb) => {
            setAddServerOpen(false);
            try {
              await api.addServer(name, url, vramGb);
              const cfg = await api.getConfig();
              setServerConfig(cfg);
              setHistory((h) => [...h, { id: nextId++, role: "system", content: `Added server: ${name} (${url})` }]);
              setModelLoading(true);
              const models = await api.getModels();
              setModelList(models);
            } catch (err) {
              setHistory((h) => [...h, { id: nextId++, role: "error", content: err instanceof Error ? err.message : String(err) }]);
            }
            setModelLoading(false);
          }}
          onCancel={() => setAddServerOpen(false)}
        />
      )}

      {toolPickerOpen && (
        <ToolPicker
          onDone={() => {
            setToolPickerOpen(false);
            setHistory((h) => [...h, { id: nextId++, role: "system", content: "Tool configuration updated." }]);
          }}
        />
      )}

      {newToolOpen && (
        <NewToolFlow
          onDone={(message) => {
            setNewToolOpen(false);
            setHistory((h) => [...h, { id: nextId++, role: "system", content: message }]);
          }}
        />
      )}

      {anthropicKeyPrompt && (
        <Box marginTop={1}>
          <Text color="yellow" bold>Anthropic API key (Enter to skip): </Text>
          <TextInput
            value={anthropicKeyInput}
            onChange={setAnthropicKeyInput}
            onSubmit={async (val) => {
              const key = val.trim();
              setAnthropicKeyPrompt(false);
              setAnthropicKeyInput("");
              if (key) {
                try { await api.setCloudKey(key); } catch {}
                setHistory((h) => [...h, { id: nextId++, role: "system", content: "Anthropic API key saved." }]);
              } else {
                setHistory((h) => [...h, { id: nextId++, role: "system", content: "Using subscription auth." }]);
              }
              if (cloudSetupPending.current) {
                setCloudModelInput(cloudModel);
                setCloudModelPrompt(true);
              }
            }}
          />
        </Box>
      )}

      {cloudModelPrompt && (
        <Box marginTop={1}>
          <Text color="yellow" bold>Claude model (Enter for {cloudModelInput}): </Text>
          <TextInput
            value={cloudModelInput}
            onChange={setCloudModelInput}
            onSubmit={async (val) => {
              const model = val.trim() || cloudModelInput;
              setCloudModelPrompt(false);
              setCloudModelInput("");
              try { await api.setCloudModel(model); } catch {}
              cloudSetupPending.current = false;
              setServerConfig((c) => ({ ...c, anthropic: { ...c.anthropic, model } }));
              setHistory((h) => [...h, { id: nextId++, role: "system", content: `Claude model: ${model}` }]);
            }}
          />
        </Box>
      )}

      {mePrompt && (
        <Box marginTop={1}>
          <Text color="yellow" bold>Enter your name: </Text>
          <TextInput
            value={meInput}
            onChange={setMeInput}
            onSubmit={async (val) => {
              const name = val.trim();
              if (name) {
                try { await api.putConfig({ userName: name }); } catch {}
                setServerConfig((c) => ({ ...c, userName: name }));
                setHistory((h) => [...h, { id: nextId++, role: "system", content: `Name set to ${name}` }]);
              }
              setMePrompt(false);
              setMeInput("");
            }}
          />
        </Box>
      )}

      {vramPrompt && (
        <Box marginTop={1}>
          <Text color="yellow" bold>VRAM in GB for {activeServer || "current server"}: </Text>
          <TextInput
            value={vramInput}
            onChange={setVramInput}
            onSubmit={async (val) => {
              const gb = Number(val.trim());
              if (gb > 0) {
                try { await api.setVram(gb); } catch {}
                setHistory((h) => [...h, { id: nextId++, role: "system", content: `VRAM set to ${gb}GB for ${activeServer}` }]);
              }
              setVramPrompt(false);
              setVramInput("");
            }}
          />
        </Box>
      )}

      {inputActive && (
        <Box marginTop={1}>
          <Text color={shellMode ? "yellow" : "cyan"} bold>
            {shellMode ? "$ " : `${userName}> `}
          </Text>
          <TextInput value={input} onChange={handleChange} onSubmit={handleSubmit} />
        </Box>
      )}

      <Box flexDirection="column" borderStyle="single" borderColor="gray" borderBottom={false} borderLeft={false} borderRight={false} paddingTop={0}>
        <Box>
          <ContextBar used={tokenCount} max={numCtx} />
          <Text dimColor> [{activeServer || (serverConfig.ollama as any)?.url || getServerUrl()}]</Text>
        </Box>
        <Text dimColor>[^O: {verbose ? "verbose" : "compact"}] [⇧Tab: {shellMode ? "shell" : "chat"}] [{cloudMode ? "cloud" : "local"}]</Text>
      </Box>
    </Box>
  );
}
