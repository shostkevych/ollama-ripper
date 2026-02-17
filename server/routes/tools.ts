import { getAllToolNames, getToolDescription, isToolEnabled, setDisabledTools } from "../tools/registry";
import { saveAndRegisterTool } from "../tools/custom-loader";
import { loadStore } from "../store";
import { json, parseJSON, type RouteHandler } from "../middleware";

export const getTools: RouteHandler = () => {
  const names = getAllToolNames();
  return json(
    names.map((name) => ({
      name,
      description: getToolDescription(name),
      enabled: isToolEnabled(name),
    }))
  );
};

export const toggleTool: RouteHandler = async (req, params) => {
  const body = await parseJSON<{ enabled?: boolean }>(req);
  if (body?.enabled === undefined) return json({ error: "enabled is required" }, 400);

  const names = getAllToolNames();
  if (!names.includes(params.name)) return json({ error: "Tool not found" }, 404);

  const store = loadStore();
  const disabled = new Set(store.disabledTools ?? []);
  if (body.enabled) {
    disabled.delete(params.name);
  } else {
    disabled.add(params.name);
  }
  setDisabledTools(Array.from(disabled));
  return json({ ok: true, name: params.name, enabled: body.enabled });
};

export const createCustomTool: RouteHandler = async (req) => {
  const body = await parseJSON<{ name?: string; code?: string }>(req);
  if (!body?.name || !body?.code) return json({ error: "name and code are required" }, 400);

  try {
    await saveAndRegisterTool(body.name, body.code);
    return json({ ok: true, name: body.name });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
};
