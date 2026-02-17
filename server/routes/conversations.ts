import { listConversations, getConversation } from "../db";
import { json, extractToken, type RouteHandler } from "../middleware";
import { getOrCreateSession } from "../session";

export const getConversations: RouteHandler = () => {
  return json(listConversations());
};

export const resumeConversation: RouteHandler = (req, params) => {
  const id = parseInt(params.id, 10);
  if (isNaN(id)) return json({ error: "Invalid id" }, 400);

  const conversation = getConversation(id);
  if (!conversation) return json({ error: "Not found" }, 404);

  const token = extractToken(req)!;
  const session = getOrCreateSession(token);

  // Inject summary as context
  session.agentMsgs.push({
    role: "user",
    content: `We are going to proceed this conversation, please understand and be ready. Here is a summary of our previous conversation:\n\n${conversation.summary}`,
  });

  return json({ ok: true, conversation });
};
