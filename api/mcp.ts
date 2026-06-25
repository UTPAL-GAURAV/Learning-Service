import express, { Request, Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { verifyToken, extractBearerToken } from "../lib/auth";
import { getUserContext } from "../lib/tools/get_user_context";
import { getSession } from "../lib/tools/get_session";
import { createSession } from "../lib/tools/create_session";
import { updateSession } from "../lib/tools/update_session";
import { addQACard } from "../lib/tools/add_qa_card";
import { updateQAAttempts } from "../lib/tools/update_qa_attempts";
import { recordScore } from "../lib/tools/record_score";
import { getScoreHistory } from "../lib/tools/get_score_history";
import { getWeakAreas } from "../lib/tools/get_weak_areas";
import { upsertWeakArea } from "../lib/tools/upsert_weak_area";
import { removeWeakArea } from "../lib/tools/remove_weak_area";

const router = express.Router();

function buildServer(userId: string): McpServer {
  const server = new McpServer({ name: "learning-service", version: "1.0.0" });

  server.tool("get_user_context", "Get user profile and active sessions summary", {}, async () => {
    const data = await getUserContext(userId);
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  });

  server.tool("get_session", "Get full session data for a topic", { topic_slug: z.string() }, async ({ topic_slug }) => {
    const data = await getSession(userId, topic_slug);
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  });

  server.tool("create_session", "Create a new learning session", {
    topic_slug: z.string(),
    topic_name: z.string(),
    syllabus_topics: z.array(z.string()),
  }, async ({ topic_slug, topic_name, syllabus_topics }) => {
    const data = await createSession(userId, topic_slug, topic_name, syllabus_topics);
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  });

  server.tool("update_session", "Partially update a session", {
    topic_slug: z.string(),
    patch: z.object({
      notes: z.string().optional(),
      readinessScore: z.number().int().min(0).max(100).optional(),
      coveredTopics: z.array(z.unknown()).optional(),
      pendingTopics: z.array(z.unknown()).optional(),
      keyConcepts: z.array(z.unknown()).optional(),
    }),
  }, async ({ topic_slug, patch }) => {
    const data = await updateSession(userId, topic_slug, patch);
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  });

  server.tool("add_qa_card", "Add a Q&A card to a session", {
    topic_slug: z.string(),
    card: z.object({
      id: z.string(),
      question: z.string(),
      answer: z.string(),
      difficulty: z.enum(["easy", "medium", "hard"]),
      tags: z.array(z.string()),
    }),
  }, async ({ topic_slug, card }) => {
    const data = await addQACard(userId, topic_slug, card);
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  });

  server.tool("update_qa_attempts", "Record a practice attempt on a Q&A card", {
    card_id: z.string(),
    attempt: z.object({ timestamp: z.string(), correct: z.boolean() }),
  }, async ({ card_id, attempt }) => {
    const data = await updateQAAttempts(card_id, attempt);
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  });

  server.tool("record_score", "Record a readiness score for a topic", {
    topic_slug: z.string(),
    score: z.number().int().min(0).max(100),
    note: z.string().optional(),
  }, async ({ topic_slug, score, note }) => {
    const data = await recordScore(userId, topic_slug, score, note);
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  });

  server.tool("get_score_history", "Get score history for one or all topics", {
    topic_slug: z.string().optional(),
  }, async ({ topic_slug }) => {
    const data = await getScoreHistory(userId, topic_slug);
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  });

  server.tool("get_weak_areas", "Get weak areas for one or all topics", {
    topic_slug: z.string().optional(),
  }, async ({ topic_slug }) => {
    const data = await getWeakAreas(userId, topic_slug);
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  });

  server.tool("upsert_weak_area", "Insert or update a weak area", {
    topic_slug: z.string(),
    sub_topic: z.string(),
    description: z.string(),
  }, async ({ topic_slug, sub_topic, description }) => {
    const data = await upsertWeakArea(userId, topic_slug, sub_topic, description);
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  });

  server.tool("remove_weak_area", "Remove a resolved weak area", {
    topic_slug: z.string(),
    sub_topic: z.string(),
  }, async ({ topic_slug, sub_topic }) => {
    const data = await removeWeakArea(userId, topic_slug, sub_topic);
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  });

  return server;
}

router.post("/", async (req: Request, res: Response) => {
  let userId: string;
  try {
    const token = extractBearerToken(req.headers.authorization);
    ({ userId } = verifyToken(token));
  } catch {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const server = buildServer(userId);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  res.on("close", () => { transport.close(); server.close(); });

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

export default router;
