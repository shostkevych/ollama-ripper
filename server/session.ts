import type { OllamaMessage } from "./ollama";
import type { SSEWriter } from "./sse";
import { log } from "./log";

export interface AskUserPending {
  resolve: (answer: string) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface Session {
  agentMsgs: OllamaMessage[];
  tokenCount: number;
  activeSSE: SSEWriter | null;
  askPending: Map<string, AskUserPending>;
  lastActivity: number;
}

const sessions = new Map<string, Session>();

const CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour
const SESSION_TTL = 24 * 60 * 60 * 1000; // 24 hours

export function getOrCreateSession(token: string): Session {
  const tk = token.slice(0, 8) + "...";
  let session = sessions.get(token);
  if (!session) {
    session = {
      agentMsgs: [],
      tokenCount: 0,
      activeSSE: null,
      askPending: new Map(),
      lastActivity: Date.now(),
    };
    sessions.set(token, session);
    log.info("session", `created new session ${tk} (total: ${sessions.size})`);
  }
  session.lastActivity = Date.now();
  return session;
}

export function getSession(token: string): Session | undefined {
  return sessions.get(token);
}

// Cleanup stale sessions
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [token, session] of sessions) {
    if (now - session.lastActivity > SESSION_TTL) {
      session.activeSSE?.close();
      for (const pending of session.askPending.values()) {
        clearTimeout(pending.timer);
        pending.reject(new Error("Session expired"));
      }
      sessions.delete(token);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    log.info("session", `cleanup: removed ${cleaned} stale session(s), ${sessions.size} remaining`);
  }
}, CLEANUP_INTERVAL);
