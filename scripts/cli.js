#!/usr/bin/env node
"use strict";

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const os = require("os");
const readline = require("readline");
const net = require("net");
const { exec } = require("child_process");

const BACKEND = "https://learning-service-yys6.onrender.com";
const CONFIG_DIR = path.join(os.homedir(), ".learning-service");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

function openBrowser(url) {
  const cmd =
    process.platform === "darwin"
      ? `open "${url}"`
      : process.platform === "win32"
      ? `start "" "${url}"`
      : `xdg-open "${url}"`;
  exec(cmd);
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

function waitForToken(port) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://localhost:${port}`);
      const token = url.searchParams.get("token");
      if (token) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<html><body><h2>Authentication successful! You can close this tab.</h2></body></html>");
        server.close();
        resolve(token);
      } else {
        res.writeHead(400);
        res.end("Missing token");
        reject(new Error("No token in callback"));
      }
    });
    server.listen(port);
    server.on("error", reject);
  });
}

function prompt(rl, question) {
  return new Promise((resolve) => rl.question(question, (ans) => resolve(ans.trim())));
}

function apiPut(path, token, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const url = new URL(path, BACKEND);
    const req = https.request(
      {
        hostname: url.hostname,
        path: url.pathname,
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
          Authorization: `Bearer ${token}`,
        },
      },
      (res) => {
        res.resume();
        res.on("end", () =>
          res.statusCode < 300 ? resolve() : reject(new Error(`PUT ${path} → ${res.statusCode}`))
        );
      }
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

function writeVSCodeMCPConfig(token) {
  const candidates = [
    path.join(os.homedir(), "Library", "Application Support", "Code", "User", "settings.json"),
    path.join(os.homedir(), ".config", "Code", "User", "settings.json"),
    path.join(os.homedir(), "Library", "Application Support", "Cursor", "User", "settings.json"),
    path.join(os.homedir(), ".config", "Cursor", "User", "settings.json"),
  ];

  const settingsPath = candidates.find((p) => fs.existsSync(p)) ?? candidates[0];

  let settings = {};
  if (fs.existsSync(settingsPath)) {
    try { settings = JSON.parse(fs.readFileSync(settingsPath, "utf8")); } catch { /* corrupt */ }
  }

  const mcpServers = settings["mcp.servers"] ?? {};
  mcpServers["learning"] = {
    command: "npx",
    args: ["github:UTPAL-GAURAV/Learning-Service", "--mcp"],
  };
  settings["mcp.servers"] = mcpServers;

  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf8");
  console.log(`MCP config written to ${settingsPath}`);
}

async function runMcp() {
  if (!fs.existsSync(CONFIG_FILE)) {
    console.error("Not set up. Run: npx github:UTPAL-GAURAV/Learning-Service");
    process.exit(1);
  }
  const { token } = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
  const { startMcpServer } = require("./mcp-server.js");
  await startMcpServer(token);
}

async function runSetup() {
  const port = await getFreePort();
  console.log("\nOpening Google login in your browser...");
  openBrowser(`${BACKEND}/auth/google?state=${port}`);

  console.log(`Waiting for OAuth callback on http://localhost:${port}/callback ...`);
  const token = await waitForToken(port);
  console.log("Authentication successful!\n");

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const role = await prompt(rl, "What's your role? (e.g. SDE-2, UX Designer, QA Engineer)\n> ");
  const learningGoal = await prompt(rl, "\nWhat are you learning for? (e.g. FAANG interview, promotion, skill gap)\n> ");
  const levelRaw = await prompt(rl, "\nLevel? (beginner / intermediate / senior)\n> ");
  rl.close();

  const level = ["beginner", "intermediate", "senior"].includes(levelRaw.toLowerCase())
    ? levelRaw.toLowerCase()
    : "intermediate";

  await apiPut("/api/me", token, { role, learningGoal, level });

  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify({ token, backend: BACKEND }, null, 2), "utf8");
  console.log(`\nToken saved to ${CONFIG_FILE}`);

  writeVSCodeMCPConfig(token);

  console.log("\nAll done! Open your project folder in VS Code and start a Claude session.");
  console.log('Try: "Start a learning session on system design"\n');
}

async function main() {
  if (process.argv.includes("--mcp")) {
    await runMcp();
  } else {
    await runSetup();
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
