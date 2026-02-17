import { query, tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { config } from "./config";
import type { OllamaMessage, OllamaChatResponse } from "./ollama";

export type InterviewEvent =
  | { type: "thinking" }
  | { type: "question"; question: string; round: number }
  | { type: "answering" }
  | { type: "answer"; answer: string; round: number }
  | { type: "scoring" }
  | { type: "done"; score: string; exchanges: number }
  | { type: "error"; error: string };

export interface InterviewResult {
  score: string;
  exchanges: number;
}

const INTERVIEWER_SYSTEM = (topic: string) =>
  `You are an aggressive technical interviewer pushing the limits of a candidate on: "${topic}".

Rules:
- Ask ONE question at a time using the ask_candidate tool
- Start with moderate questions, then rapidly escalate to expert-level, edge cases, and tricky gotchas
- REACT to the candidate's answers — if they say something wrong, challenge them directly. If they say something interesting, dig deeper into that specific area
- Don't follow a script. Change direction based on what the candidate reveals — probe weaknesses, test if confident answers hold under pressure
- Feel free to argue, push back, present counterexamples, or ask "are you sure about that?"
- Try to find the boundary of their knowledge — keep pushing until they break
- If the user specified a number of questions (e.g. "5 questions", "3q", "10 questions on X"), ask EXACTLY that many and no more. Otherwise default to 5-10 questions
- When you've reached the question limit or found their limits, stop calling the tool and provide your assessment
- Be direct and intense, not polite

When done, provide a final assessment:
1. Score: X/10
2. Strengths (bullet points)
3. Weaknesses (bullet points)
4. Brief overall summary`;

const SCORER_SYSTEM = (topic: string) =>
  `You are a technical interviewer who was interviewing a candidate on: "${topic}".
The interview was stopped early. Based on the transcript below, provide your final assessment:
1. Score: X/10
2. Strengths (bullet points)
3. Weaknesses (bullet points)
4. Brief overall summary`;

function buildEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined) env[k] = v;
  }
  if (config.anthropic.apiKey) {
    env.ANTHROPIC_API_KEY = config.anthropic.apiKey;
  }
  return env;
}

async function askLocalModel(question: string, signal: AbortSignal): Promise<string> {
  const messages: OllamaMessage[] = [
    { role: "system", content: "You are a candidate in a technical interview. Answer like a real person — short sentences, plain text, no markdown, no bullet points, no headers. Talk naturally as if speaking out loud. Be direct and concise, a few sentences at most." },
    { role: "user", content: question },
  ];
  const res = await fetch(`${config.ollama.url}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.ollama.model,
      messages,
      stream: false,
      keep_alive: -1,
      options: { num_ctx: config.ollama.numCtx, num_keep: -1 },
    }),
    signal,
  });
  if (!res.ok) throw new Error(`Ollama error ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as OllamaChatResponse;
  return data.message.content;
}

async function scoreTranscript(
  topic: string,
  transcript: { question: string; answer: string }[],
  onEvent: (event: InterviewEvent) => void,
): Promise<string> {
  const lines = transcript.map((t, i) =>
    `Q${i + 1}: ${t.question}\nA${i + 1}: ${t.answer}`
  ).join("\n\n");

  let finalText = "";
  for await (const msg of query({
    prompt: `Here is the interview transcript:\n\n${lines}\n\nProvide your final assessment.`,
    options: {
      systemPrompt: SCORER_SYSTEM(topic),
      maxTurns: 1,
      model: config.anthropic.model,
      env: buildEnv(),
    },
  })) {
    if (msg.type === "result" && msg.subtype === "success") {
      finalText = msg.result;
    }
  }
  return finalText || "Interview stopped early — no assessment generated.";
}

export async function runInterview(
  topic: string,
  onEvent: (event: InterviewEvent) => void,
  signal: AbortSignal,
  shouldScore: { value: boolean }
): Promise<InterviewResult> {
  let round = 0;
  const transcript: { question: string; answer: string }[] = [];

  try {
    const askCandidate = tool(
      "ask_candidate",
      "Ask the candidate a question. The candidate will answer and the result will be returned.",
      { question: z.string().describe("The interview question to ask the candidate") },
      async (args) => {
        round++;
        onEvent({ type: "question", question: args.question, round });
        onEvent({ type: "answering" });
        const answer = await askLocalModel(args.question, signal);
        transcript.push({ question: args.question, answer });
        onEvent({ type: "answer", answer, round });
        return { content: [{ type: "text" as const, text: answer }] };
      }
    );

    const interviewServer = createSdkMcpServer({
      name: "interview",
      tools: [askCandidate],
    });

    onEvent({ type: "thinking" });
    let finalText = "";

    for await (const msg of query({
      prompt: `Begin the interview on: ${topic}`,
      options: {
        systemPrompt: INTERVIEWER_SYSTEM(topic),
        mcpServers: { interview: interviewServer },
        allowedTools: ["mcp__interview__ask_candidate"],
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        maxTurns: 20,
        model: config.anthropic.model,
        env: buildEnv(),
      },
    })) {
      // Break out immediately when aborted — the SDK swallows tool errors internally
      if (signal.aborted) break;

      if (msg.type === "assistant") {
        onEvent({ type: "thinking" });
      } else if (msg.type === "result") {
        if (msg.subtype === "success") {
          finalText = msg.result;
        } else {
          finalText = msg.errors?.join("\n") ?? "Interview ended (max turns).";
        }
      }
    }

    // After breaking out of the loop due to abort
    if (signal.aborted) {
      if (shouldScore.value && transcript.length > 0) {
        onEvent({ type: "scoring" });
        const score = await scoreTranscript(topic, transcript, onEvent);
        return { score, exchanges: round };
      }
      if (round === 0) {
        return { score: "Interview stopped before any questions were asked.", exchanges: 0 };
      }
      return { score: "Interview was stopped early.", exchanges: round };
    }

    if (!finalText && round > 0) {
      finalText = "Interview completed but no assessment was generated.";
    }

    return { score: finalText, exchanges: round };
  } catch (err) {
    // Some SDKs may still throw — handle the same way
    if (err instanceof DOMException && err.name === "AbortError") {
      if (shouldScore.value && transcript.length > 0) {
        onEvent({ type: "scoring" });
        const score = await scoreTranscript(topic, transcript, onEvent);
        return { score, exchanges: round };
      }
      if (round === 0) {
        return { score: "Interview stopped before any questions were asked.", exchanges: 0 };
      }
      return { score: "Interview was stopped early.", exchanges: round };
    }
    const msg = err instanceof Error ? err.message : String(err);
    onEvent({ type: "error", error: msg });
    return { score: `Error: ${msg}`, exchanges: 0 };
  }
}
