"use strict";

// Implements MCP stdio and HTTP transports using raw JSON-RPC — no npm deps required.
// This lets `npx github:UTPAL-GAURAV/Learning-Service --mcp` work without
// installing node_modules (npx installs the package but skips postinstall deps
// in many environments, so @modelcontextprotocol/sdk is not guaranteed present).

const https = require("https");
const http = require("http");

function apiCallOnce(method, urlPath, token, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const url = new URL(urlPath, "https://learning-service-yys6.onrender.com");
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
        timeout: 35000,
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
    req.on("timeout", () => { req.destroy(new Error("Request timed out")); });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// Retries up to 6 times with 5s delay (30s total window) to handle Render cold-starts.
async function apiCall(method, urlPath, token, body, retries = 6, delayMs = 5000) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await apiCallOnce(method, urlPath, token, body);
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

// ── Tool definitions ──────────────────────────────────────────────────────────

function buildTools() {
  return [
    {
      name: "get_user_context",
      description: "Get user profile and active sessions summary",
      inputSchema: { type: "object", properties: {}, required: [] },
    },
    {
      name: "get_session",
      description: "Get full session data for a topic",
      inputSchema: {
        type: "object",
        properties: { topic_slug: { type: "string" } },
        required: ["topic_slug"],
      },
    },
    {
      name: "create_session",
      description: "Create a new learning session",
      inputSchema: {
        type: "object",
        properties: {
          topic_slug: { type: "string" },
          topic_name: { type: "string" },
          syllabus_topics: { type: "array", items: { type: "string" } },
        },
        required: ["topic_slug", "topic_name", "syllabus_topics"],
      },
    },
    {
      name: "update_session",
      description: "Partially update a session",
      inputSchema: {
        type: "object",
        properties: {
          topic_slug: { type: "string" },
          patch: {
            type: "object",
            properties: {
              notes: { type: "string" },
              readinessScore: { type: "number" },
              coveredTopics: { type: "array" },
              pendingTopics: { type: "array" },
              keyConcepts: { type: "array" },
            },
          },
        },
        required: ["topic_slug", "patch"],
      },
    },
    {
      name: "add_qa_card",
      description: "Add a Q&A card to a session",
      inputSchema: {
        type: "object",
        properties: {
          topic_slug: { type: "string" },
          card: {
            type: "object",
            properties: {
              id: { type: "string" },
              question: { type: "string" },
              answer: { type: "string" },
              difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
              tags: { type: "array", items: { type: "string" } },
            },
            required: ["id", "question", "answer", "difficulty", "tags"],
          },
        },
        required: ["topic_slug", "card"],
      },
    },
    {
      name: "update_qa_attempts",
      description: "Record a practice attempt on a Q&A card",
      inputSchema: {
        type: "object",
        properties: {
          card_id: { type: "string" },
          attempt: {
            type: "object",
            properties: {
              timestamp: { type: "string" },
              correct: { type: "boolean" },
            },
            required: ["timestamp", "correct"],
          },
        },
        required: ["card_id", "attempt"],
      },
    },
    {
      name: "record_score",
      description: "Record a readiness score for a topic",
      inputSchema: {
        type: "object",
        properties: {
          topic_slug: { type: "string" },
          score: { type: "number" },
          note: { type: "string" },
        },
        required: ["topic_slug", "score"],
      },
    },
    {
      name: "get_score_history",
      description: "Get score history for one or all topics",
      inputSchema: {
        type: "object",
        properties: { topic_slug: { type: "string" } },
        required: [],
      },
    },
    {
      name: "get_weak_areas",
      description: "Get weak areas for one or all topics",
      inputSchema: {
        type: "object",
        properties: { topic_slug: { type: "string" } },
        required: [],
      },
    },
    {
      name: "upsert_weak_area",
      description: "Insert or update a weak area",
      inputSchema: {
        type: "object",
        properties: {
          topic_slug: { type: "string" },
          sub_topic: { type: "string" },
          description: { type: "string" },
        },
        required: ["topic_slug", "sub_topic", "description"],
      },
    },
    {
      name: "remove_weak_area",
      description: "Remove a resolved weak area",
      inputSchema: {
        type: "object",
        properties: {
          topic_slug: { type: "string" },
          sub_topic: { type: "string" },
        },
        required: ["topic_slug", "sub_topic"],
      },
    },
  ];
}

// ── Tool dispatch ─────────────────────────────────────────────────────────────

async function callTool(name, args, token) {
  switch (name) {
    case "get_user_context": {
      const [user, sessions] = await Promise.all([
        apiCall("GET", "/api/me", token),
        apiCall("GET", "/api/sessions", token),
      ]);
      return { user, sessions };
    }
    case "get_session":
      return apiCall("GET", `/api/sessions/${args.topic_slug}`, token).catch(() => null);
    case "create_session":
      return apiCall("POST", "/api/sessions", token, {
        topicSlug: args.topic_slug,
        topicName: args.topic_name,
        syllabusTopics: args.syllabus_topics,
      });
    case "update_session":
      return apiCall("PATCH", `/api/sessions/${args.topic_slug}`, token, args.patch);
    case "add_qa_card":
      return apiCall("POST", `/api/sessions/${args.topic_slug}/cards`, token, args.card);
    case "update_qa_attempts":
      return apiCall("PATCH", `/api/cards/${args.card_id}/attempts`, token, args.attempt);
    case "record_score":
      return apiCall("POST", `/api/sessions/${args.topic_slug}/scores`, token, {
        score: args.score,
        note: args.note,
      });
    case "get_score_history": {
      const p = args.topic_slug ? `/api/sessions/${args.topic_slug}/scores` : "/api/sessions";
      return apiCall("GET", p, token);
    }
    case "get_weak_areas": {
      const p = args.topic_slug ? `/api/weak-areas?topic=${args.topic_slug}` : "/api/weak-areas";
      return apiCall("GET", p, token);
    }
    case "upsert_weak_area":
      return apiCall(
        "PUT",
        `/api/weak-areas/${args.topic_slug}/${encodeURIComponent(args.sub_topic)}`,
        token,
        { description: args.description }
      );
    case "remove_weak_area":
      await apiCall(
        "DELETE",
        `/api/weak-areas/${args.topic_slug}/${encodeURIComponent(args.sub_topic)}`,
        token
      );
      return { deleted: true };
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ── Raw JSON-RPC stdio transport ──────────────────────────────────────────────

async function startMcpServer(token) {
  const tools = buildTools();

  function send(obj) {
    const msg = JSON.stringify(obj);
    process.stdout.write(`Content-Length: ${Buffer.byteLength(msg)}\r\n\r\n${msg}`);
  }

  function respond(id, result) {
    send({ jsonrpc: "2.0", id, result });
  }

  function respondError(id, code, message) {
    send({ jsonrpc: "2.0", id, error: { code, message } });
  }

  let buf = Buffer.alloc(0);

  process.stdin.on("data", async (chunk) => {
    buf = Buffer.concat([buf, chunk]);

    while (true) {
      const header = buf.toString("utf8", 0, Math.min(buf.length, 512));
      const sep = header.indexOf("\r\n\r\n");
      if (sep === -1) break;

      const headerStr = header.slice(0, sep);
      const match = headerStr.match(/Content-Length:\s*(\d+)/i);
      if (!match) { buf = buf.slice(sep + 4); continue; }

      const bodyLen = parseInt(match[1], 10);
      const bodyStart = sep + 4;
      if (buf.length < bodyStart + bodyLen) break;

      const body = buf.toString("utf8", bodyStart, bodyStart + bodyLen);
      buf = buf.slice(bodyStart + bodyLen);

      let msg;
      try { msg = JSON.parse(body); } catch { continue; }

      const { id, method, params } = msg;

      try {
        if (method === "initialize") {
          respond(id, {
            protocolVersion: "2024-11-05",
            capabilities: { tools: {} },
            serverInfo: { name: "learning-service", version: "1.0.0" },
          });
        } else if (method === "notifications/initialized") {
          // no response needed for notifications
        } else if (method === "tools/list") {
          respond(id, { tools });
        } else if (method === "tools/call") {
          const result = await callTool(params.name, params.arguments || {}, token);
          respond(id, {
            content: [{ type: "text", text: JSON.stringify(result) }],
          });
        } else if (id !== undefined) {
          respondError(id, -32601, `Method not found: ${method}`);
        }
      } catch (err) {
        if (id !== undefined) {
          respondError(id, -32603, err.message || String(err));
        }
      }
    }
  });

  process.stdin.resume();
}

// ── HTTP JSON-RPC transport ───────────────────────────────────────────────────

async function startHttpMcpServer(token, port = 3456) {
  const tools = buildTools();

  // Sessions: Map<sessionId, { send: fn }>
  const sessions = new Map();

  function makeResponder(res, sessionId) {
    return function send(obj) {
      const body = JSON.stringify(obj);
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
        ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}),
      });
      res.end(body);
    };
  }

  const server = http.createServer(async (req, res) => {
    if (req.url !== "/mcp") {
      res.writeHead(404).end();
      return;
    }

    // CORS for local clients
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, GET, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Mcp-Session-Id");

    if (req.method === "OPTIONS") {
      res.writeHead(204).end();
      return;
    }

    if (req.method === "DELETE") {
      const sid = req.headers["mcp-session-id"];
      if (sid) sessions.delete(sid);
      res.writeHead(204).end();
      return;
    }

    if (req.method !== "POST") {
      res.writeHead(405).end();
      return;
    }

    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      let msg;
      try { msg = JSON.parse(body); } catch {
        res.writeHead(400).end(JSON.stringify({ error: "Invalid JSON" }));
        return;
      }

      const { id, method, params } = msg;
      const send = makeResponder(res, req.headers["mcp-session-id"]);

      try {
        if (method === "initialize") {
          const sessionId = `sess-${Date.now()}-${Math.random().toString(36).slice(2)}`;
          sessions.set(sessionId, {});
          send({
            jsonrpc: "2.0", id,
            result: {
              protocolVersion: "2024-11-05",
              capabilities: { tools: {} },
              serverInfo: { name: "learning-service", version: "1.0.0" },
              sessionId,
            },
          });
        } else if (method === "notifications/initialized") {
          res.writeHead(204).end();
        } else if (method === "tools/list") {
          send({ jsonrpc: "2.0", id, result: { tools } });
        } else if (method === "tools/call") {
          const result = await callTool(params.name, params.arguments || {}, token);
          send({
            jsonrpc: "2.0", id,
            result: { content: [{ type: "text", text: JSON.stringify(result) }] },
          });
        } else if (id !== undefined) {
          send({ jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } });
        } else {
          res.writeHead(204).end();
        }
      } catch (err) {
        if (!res.headersSent) {
          send({ jsonrpc: "2.0", id: id ?? null, error: { code: -32603, message: err.message || String(err) } });
        }
      }
    });
  });

  server.listen(port, "127.0.0.1", () => {
    process.stderr.write(`learning-service MCP HTTP server listening on http://127.0.0.1:${port}/mcp\n`);
  });
}

module.exports = { startMcpServer, startHttpMcpServer };
