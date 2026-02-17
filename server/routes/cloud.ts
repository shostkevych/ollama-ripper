import { setAnthropicKey, setAnthropicModel, config } from "../config";
import { json, parseJSON, type RouteHandler } from "../middleware";

export const putCloudModel: RouteHandler = async (req) => {
  const body = await parseJSON<{ model?: string }>(req);
  if (!body?.model) return json({ error: "model is required" }, 400);
  setAnthropicModel(body.model);
  return json({ ok: true, model: body.model });
};

export const putCloudKey: RouteHandler = async (req) => {
  const body = await parseJSON<{ key?: string }>(req);
  if (!body?.key) return json({ error: "key is required" }, 400);
  setAnthropicKey(body.key);
  return json({ ok: true });
};
