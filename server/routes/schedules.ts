import { createSchedule, listSchedules, getSchedule, removeSchedule, setScheduleEnabled } from "../schedule-db";
import { json, parseJSON, type RouteHandler } from "../middleware";

export const getSchedules: RouteHandler = () => {
  return json(listSchedules());
};

export const postSchedule: RouteHandler = async (req) => {
  const body = await parseJSON<{ prompt?: string; expr?: string }>(req);
  if (!body?.prompt || !body?.expr) return json({ error: "prompt and expr are required" }, 400);
  try {
    const schedule = createSchedule(body.prompt, body.expr);
    return json(schedule, 201);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
};

export const getScheduleById: RouteHandler = (_req, params) => {
  const id = parseInt(params.id, 10);
  if (isNaN(id)) return json({ error: "Invalid id" }, 400);
  const schedule = getSchedule(id);
  if (!schedule) return json({ error: "Not found" }, 404);
  return json(schedule);
};

export const deleteSchedule: RouteHandler = (_req, params) => {
  const id = parseInt(params.id, 10);
  if (isNaN(id)) return json({ error: "Invalid id" }, 400);
  const removed = removeSchedule(id);
  if (!removed) return json({ error: "Not found" }, 404);
  return json({ ok: true });
};

export const patchSchedule: RouteHandler = async (req, params) => {
  const id = parseInt(params.id, 10);
  if (isNaN(id)) return json({ error: "Invalid id" }, 400);
  const body = await parseJSON<{ enabled?: boolean }>(req);
  if (body?.enabled === undefined) return json({ error: "enabled is required" }, 400);
  const updated = setScheduleEnabled(id, body.enabled);
  if (!updated) return json({ error: "Not found" }, 404);
  return json(getSchedule(id));
};
