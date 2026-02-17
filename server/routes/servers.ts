import { addServer, switchServer, getServers, getActiveServerName, setVramGb } from "../config";
import { json, parseJSON, type RouteHandler } from "../middleware";

export const getServersRoute: RouteHandler = () => {
  return json({ servers: getServers(), activeServer: getActiveServerName() });
};

export const addServerRoute: RouteHandler = async (req) => {
  const body = await parseJSON<{ name?: string; url?: string; vramGb?: number }>(req);
  if (!body?.name || !body?.url) return json({ error: "name and url are required" }, 400);
  addServer(body.name, body.url, body.vramGb);
  return json({ ok: true, servers: getServers(), activeServer: getActiveServerName() });
};

export const activateServerRoute: RouteHandler = (_req, params) => {
  switchServer(params.name);
  return json({ ok: true, activeServer: getActiveServerName() });
};

export const setVramRoute: RouteHandler = async (req) => {
  const body = await parseJSON<{ gb?: number }>(req);
  if (!body?.gb || body.gb <= 0) return json({ error: "gb must be a positive number" }, 400);
  setVramGb(body.gb);
  return json({ ok: true, vramGb: body.gb });
};
