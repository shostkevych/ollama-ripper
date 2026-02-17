import { listModels, getModelInfo, preloadModel, listRunningModels } from "../ollama";
import { config, setModel } from "../config";
import { json, parseJSON, type RouteHandler } from "../middleware";

export const getModels: RouteHandler = async () => {
  try {
    const models = await listModels();
    return json(models);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 502);
  }
};

export const switchModel: RouteHandler = async (req) => {
  const body = await parseJSON<{ model?: string }>(req);
  if (!body?.model) return json({ error: "model is required" }, 400);

  try {
    const info = await getModelInfo(body.model);
    const numCtx = info?.numCtx ?? config.ollama.numCtx;
    setModel(body.model, numCtx, info?.sizeBytes);
    await preloadModel(body.model).catch(() => {});
    return json({
      model: body.model,
      numCtx,
      sizeBytes: info?.sizeBytes ?? 0,
      warning: info?.warning,
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 502);
  }
};

export const getModelStatus: RouteHandler = async () => {
  try {
    const running = await listRunningModels();
    return json({
      currentModel: config.ollama.model,
      numCtx: config.ollama.numCtx,
      running: running.map((m) => m.name),
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 502);
  }
};
