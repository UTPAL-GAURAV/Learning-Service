import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import * as https from "https";
import * as http from "http";

function apiCallOnce(
  method: string,
  path: string,
  token: string,
  body?: unknown
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const url = new URL(path, "https://learning-service-yys6.onrender.com");
    const req = https.request(
      {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode === 204) return resolve(null);
          try { resolve(JSON.parse(data)); } catch { resolve(data); }
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function apiCall(
  method: string,
  path: string,
  token: string,
  body?: unknown,
  retries = 6,
  delayMs = 5000
): Promise<unknown> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await apiCallOnce(method, path, token, body);
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

function buildServer(token: string): McpServer {
  const server = new McpServer({ name: "learning-service", version: "1.0.0" });

  server.tool("get_user_context", "Get user profile and active sessions summary", {}, async () => {
    const data = await apiCall("GET", "/api/me", token);
    const sessions = await apiCall("GET", "/api/sessions", token);
    return { content: [{ type: "text", text: JSON.stringify({ user: data, sessions }) }] };
  });

  server.tool("get_session", "Get full session data for a topic", { topic_slug: z.string() }, async ({ topic_slug }) => {
    const data = await apiCall("GET", `/api/sessions/${topic_slug}`, token).catch(() => null);
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  });

  server.tool("create_session", "Create a new learning session", {
    topic_slug: z.string(),
    topic_name: z.string(),
    syllabus_topics: z.array(z.string()),
  }, async ({ topic_slug, topic_name, syllabus_topics }) => {
    const data = await apiCall("POST", "/api/sessions", token, { topicSlug: topic_slug, topicName: topic_name, syllabusTopics: syllabus_topics });
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
    const data = await apiCall("PATCH", `/api/sessions/${topic_slug}`, token, patch);
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
    const data = await apiCall("POST", `/api/sessions/${topic_slug}/cards`, token, card);
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  });

  server.tool("update_qa_attempts", "Record a practice attempt on a Q&A card", {
    card_id: z.string(),
    attempt: z.object({ timestamp: z.string(), correct: z.boolean() }),
  }, async ({ card_id, attempt }) => {
    const data = await apiCall("PATCH", `/api/cards/${card_id}/attempts`, token, attempt);
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  });

  server.tool("record_score", "Record a readiness score for a topic", {
    topic_slug: z.string(),
    score: z.number().int().min(0).max(100),
    note: z.string().optional(),
  }, async ({ topic_slug, score, note }) => {
    const data = await apiCall("POST", `/api/sessions/${topic_slug}/scores`, token, { score, note });
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  });

  server.tool("get_score_history", "Get score history for one or all topics", {
    topic_slug: z.string().optional(),
  }, async ({ topic_slug }) => {
    const path = topic_slug ? `/api/sessions/${topic_slug}/scores` : "/api/sessions";
    const data = await apiCall("GET", path, token);
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  });

  server.tool("get_weak_areas", "Get weak areas for one or all topics", {
    topic_slug: z.string().optional(),
  }, async ({ topic_slug }) => {
    const path = topic_slug ? `/api/weak-areas?topic=${topic_slug}` : "/api/weak-areas";
    const data = await apiCall("GET", path, token);
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  });

  server.tool("upsert_weak_area", "Insert or update a weak area", {
    topic_slug: z.string(),
    sub_topic: z.string(),
    description: z.string(),
  }, async ({ topic_slug, sub_topic, description }) => {
    const data = await apiCall("PUT", `/api/weak-areas/${topic_slug}/${encodeURIComponent(sub_topic)}`, token, { description });
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  });

  server.tool("remove_weak_area", "Remove a resolved weak area", {
    topic_slug: z.string(),
    sub_topic: z.string(),
  }, async ({ topic_slug, sub_topic }) => {
    await apiCall("DELETE", `/api/weak-areas/${topic_slug}/${encodeURIComponent(sub_topic)}`, token);
    return { content: [{ type: "text", text: JSON.stringify({ deleted: true }) }] };
  });

  return server;
}

export async function startMcpServer(token: string) {
  const server = buildServer(token);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

export async function startHttpMcpServer(token: string, port = 3456) {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  const server = buildServer(token);
  await server.connect(transport);

  const httpServer = http.createServer((req, res) => {
    if (req.url === "/mcp") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        let parsed: unknown;
        try { parsed = body ? JSON.parse(body) : undefined; } catch { parsed = undefined; }
        transport.handleRequest(req, res, parsed);
      });
    } else {
      res.writeHead(404).end();
    }
  });

  httpServer.listen(port, "127.0.0.1", () => {
    process.stderr.write(`learning-service MCP HTTP server listening on http://127.0.0.1:${port}/mcp\n`);
  });
}
