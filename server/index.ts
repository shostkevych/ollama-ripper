// Side-effect tool imports
import "./tools/ask-user";
import "./tools/web-search";
import "./tools/read-url";
import "./tools/read-file";
import "./tools/save-rule";
import "./tools/exchange-rate";
import "./tools/knowledge";
import "./tools/manage-schedule";
import "./tools/create-tool";

import { loadCustomTools } from "./tools/custom-loader";
import { config } from "./config";
import { migrateStore } from "./store";
import { startScheduler } from "./scheduler";
import { generatePairingCode, verifyPairingCode } from "./auth";
import { json, error, requireAuth, createRouter, extractToken } from "./middleware";
import { log } from "./log";

// Route handlers
import { getConfig, putConfig } from "./routes/config";
import { getModels, switchModel, getModelStatus } from "./routes/models";
import { getServersRoute, addServerRoute, activateServerRoute, setVramRoute } from "./routes/servers";
import { getSetupStatus, postSetupStep, getSetupModels, getSetupTools } from "./routes/setup";
import { putCloudModel, putCloudKey } from "./routes/cloud";
import { postChat, postChatNew, postChatCompact, postChatSave, postChatAnswer } from "./routes/chat";
import { postInterview, deleteInterview } from "./routes/interview";
import { getTools, toggleTool, createCustomTool } from "./routes/tools";
import { getConversations, resumeConversation } from "./routes/conversations";
import { getSchedules, postSchedule, getScheduleById, deleteSchedule, patchSchedule } from "./routes/schedules";

migrateStore();
await loadCustomTools();

const PORT = parseInt(process.env.RIPPER_PORT ?? "7474", 10);

const router = createRouter();

// Auth (public)
router.post("/auth/pair", () => {
  const code = generatePairingCode();
  log.info("auth", `new pairing code: ${code}`);
  return json({ status: "pending", message: "Enter this code in the CLI to pair." });
});
router.post("/auth/verify", async (req) => {
  const body = await req.json().catch(() => null) as { code?: string } | null;
  if (!body?.code) return error("code is required");
  const token = verifyPairingCode(body.code);
  if (!token) return error("Invalid or expired code", 401);
  return json({ token });
});

// Health (public)
router.get("/health", () => json({ status: "ok" }));

// Config
router.get("/config", getConfig);
router.put("/config", putConfig);

// Models
router.get("/models", getModels);
router.post("/models/switch", switchModel);
router.get("/models/status", getModelStatus);

// Chat
router.post("/chat", postChat);
router.post("/chat/new", postChatNew);
router.post("/chat/compact", postChatCompact);
router.post("/chat/save", postChatSave);
router.post("/chat/answer", postChatAnswer);

// Conversations
router.get("/conversations", getConversations);
router.post("/conversations/:id/resume", resumeConversation);

// Interview
router.post("/interview", postInterview);
router.delete("/interview", deleteInterview);

// Schedules
router.get("/schedules", getSchedules);
router.post("/schedules", postSchedule);
router.get("/schedules/:id", getScheduleById);
router.delete("/schedules/:id", deleteSchedule);
router.patch("/schedules/:id", patchSchedule);

// Cloud
router.put("/cloud/model", putCloudModel);
router.put("/cloud/key", putCloudKey);

// Tools
router.get("/tools", getTools);
router.put("/tools/:name/toggle", toggleTool);
router.post("/tools/custom", createCustomTool);

// Servers
router.get("/servers", getServersRoute);
router.post("/servers", addServerRoute);
router.put("/servers/:name/activate", activateServerRoute);
router.put("/vram", setVramRoute);

// Setup
router.get("/setup/status", getSetupStatus);
router.post("/setup/step", postSetupStep);
router.get("/setup/models", getSetupModels);
router.get("/setup/tools", getSetupTools);

Bun.serve({
  port: PORT,
  idleTimeout: 255, // max — SSE streams (chat, interview scoring) need long-lived connections
  async fetch(req) {
    const url = new URL(req.url);
    const { pathname } = url;
    const method = req.method;

    // Auth guard
    const authErr = requireAuth(req, pathname);
    if (authErr) {
      const tk = extractToken(req);
      log.warn("auth", `denied ${method} ${pathname} token=${tk ? tk.slice(0, 8) + "..." : "none"}`);
      return authErr;
    }

    // Route matching
    const match = router.match(method, pathname);
    if (match) {
      log.info("http", `${method} ${pathname}`);
      try {
        return await match.handler(req, match.params);
      } catch (err) {
        log.error("http", `${method} ${pathname} → ${err instanceof Error ? err.message : String(err)}`);
        return error(err instanceof Error ? err.message : String(err), 500);
      }
    }

    log.warn("http", `404 ${method} ${pathname}`);
    return error("Not found", 404);
  },
});

// Start scheduler
startScheduler();

log.info("server", `OLLAMA RIPPER listening on :${PORT}`);
