import { runInterview } from "../interview";
import { json, parseJSON, extractToken, type RouteHandler } from "../middleware";
import { getOrCreateSession } from "../session";
import { createSSEResponse } from "../sse";

interface InterviewHandle {
  abort: AbortController;
  shouldScore: { value: boolean };
}

const activeInterviews = new Map<string, InterviewHandle>();

export const postInterview: RouteHandler = async (req) => {
  const token = extractToken(req)!;
  const body = await parseJSON<{ topic?: string }>(req);
  if (!body?.topic) return json({ error: "topic is required" }, 400);

  if (activeInterviews.has(token)) {
    return json({ error: "Interview already in progress" }, 409);
  }

  const { response, writer } = createSSEResponse();
  const abort = new AbortController();
  const shouldScore = { value: false };
  activeInterviews.set(token, { abort, shouldScore });

  (async () => {
    const pingInterval = setInterval(() => writer.send("ping", {}), 5_000);
    try {
      const result = await runInterview(body.topic!, (event) => {
        writer.send(event.type, event);
      }, abort.signal, shouldScore);

      writer.send("done", { score: result.score, exchanges: result.exchanges });
    } catch (err) {
      writer.send("error", { message: err instanceof Error ? err.message : String(err) });
    } finally {
      clearInterval(pingInterval);
      activeInterviews.delete(token);
      writer.close();
    }
  })();

  return response;
};

export const deleteInterview: RouteHandler = (req) => {
  const token = extractToken(req)!;
  const handle = activeInterviews.get(token);
  if (!handle) return json({ error: "No active interview" }, 404);

  const url = new URL(req.url, "http://localhost");
  const score = url.searchParams.get("score") === "true";

  if (score) {
    handle.shouldScore.value = true;
  }
  handle.abort.abort();

  return json({ ok: true });
};
