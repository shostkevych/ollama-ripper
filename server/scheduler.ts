import { listEnabledSchedules, markRunStarted, markRunFinished } from "./schedule-db";
import { computeNextRun } from "./cron-parser";
import { runAgent } from "./agent";
import type { OllamaMessage } from "./ollama";
import { log } from "./log";

const running = new Set<number>();
const TICK_INTERVAL = 15_000;

async function executeSchedule(id: number, prompt: string, expr: string): Promise<void> {
  running.add(id);
  markRunStarted(id);

  try {
    const messages: OllamaMessage[] = [
      { role: "system", content: "You are a helpful assistant running a scheduled task. Be concise." },
      { role: "user", content: prompt },
    ];
    const result = await runAgent(messages);
    const nextRun = computeNextRun(expr) ?? new Date(Date.now() + 60_000).toISOString();
    markRunFinished(id, result, null, nextRun);
    log.info("scheduler", `schedule #${id} completed`);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    const nextRun = computeNextRun(expr) ?? new Date(Date.now() + 60_000).toISOString();
    markRunFinished(id, null, error, nextRun);
    log.error("scheduler", `schedule #${id} failed: ${error}`);
  } finally {
    running.delete(id);
  }
}

async function tick(): Promise<void> {
  const now = new Date().toISOString();
  const schedules = listEnabledSchedules();

  for (const schedule of schedules) {
    if (schedule.next_run > now) continue;
    if (running.has(schedule.id)) continue;

    log.info("scheduler", `firing schedule #${schedule.id}: "${schedule.prompt.slice(0, 60)}"`);
    executeSchedule(schedule.id, schedule.prompt, schedule.schedule_expr);
  }
}

let timer: ReturnType<typeof setInterval> | null = null;

export function startScheduler(): void {
  if (timer) return;
  log.info("scheduler", "started (tick every 15s)");
  tick();
  timer = setInterval(tick, TICK_INTERVAL);
}

export function stopScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
