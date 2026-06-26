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

function resolveMcpCommand() {
  // Use `node <absolute-path-to-cli.js>` so Claude Code launches the server directly
  // without going through npx. npx prints "Need to install..." to stdout on first run,
  // corrupting the MCP Content-Length framing before the server even starts.
  //
  // Strategy: find the real install path via `npm root -g`, which is stable across
  // package managers on all platforms (homebrew, nvm, system npm, volta, fnm).
  try {
    const { execSync } = require("child_process");
    const npmRoot = execSync("npm root -g", { encoding: "utf8" }).trim();
    const cliPath = path.join(npmRoot, "learning-service", "scripts", "cli.js");
    if (fs.existsSync(cliPath)) {
      return { command: process.execPath, args: [cliPath, "--mcp"] };
    }
  } catch { /* npm root -g failed */ }

  // Fallback: we're running from the script itself (e.g. local dev or npx temp path)
  const thisScript = process.argv[1];
  if (thisScript && fs.existsSync(thisScript)) {
    return { command: process.execPath, args: [thisScript, "--mcp"] };
  }

  // Last resort: npx with --yes to suppress the interactive install prompt
  return { command: "npx", args: ["--yes", "github:UTPAL-GAURAV/Learning-Service", "--mcp"] };
}

function writeMCPConfigs() {
  const mcpEntry = resolveMcpCommand();

  // ── VS Code / Cursor: global settings.json ──
  const vsCandidates = [
    path.join(os.homedir(), "Library", "Application Support", "Code", "User", "settings.json"),
    path.join(os.homedir(), ".config", "Code", "User", "settings.json"),
    path.join(os.homedir(), "Library", "Application Support", "Cursor", "User", "settings.json"),
    path.join(os.homedir(), ".config", "Cursor", "User", "settings.json"),
  ];
  const vsSettingsPath = vsCandidates.find((p) => fs.existsSync(p));
  if (vsSettingsPath) {
    let vsSettings = {};
    try { vsSettings = JSON.parse(fs.readFileSync(vsSettingsPath, "utf8")); } catch { /* corrupt */ }
    vsSettings["mcp.servers"] = vsSettings["mcp.servers"] ?? {};
    vsSettings["mcp.servers"]["learning"] = mcpEntry;
    fs.writeFileSync(vsSettingsPath, JSON.stringify(vsSettings, null, 2), "utf8");
    console.log(`VS Code MCP config written to ${vsSettingsPath}`);
  }

  // ── Claude Code: project .claude/settings.json (in cwd) ──
  // Also write user-level Claude Code settings as a fallback.
  const claudeProjectSettings = path.join(process.cwd(), ".claude", "settings.json");
  const claudeUserSettings = path.join(os.homedir(), ".claude", "settings.json");

  for (const claudeSettingsPath of [claudeProjectSettings, claudeUserSettings]) {
    if (!fs.existsSync(claudeSettingsPath)) continue;
    let claudeSettings = {};
    try { claudeSettings = JSON.parse(fs.readFileSync(claudeSettingsPath, "utf8")); } catch { /* corrupt */ }
    claudeSettings.mcpServers = claudeSettings.mcpServers ?? {};
    claudeSettings.mcpServers["learning"] = mcpEntry;
    fs.writeFileSync(claudeSettingsPath, JSON.stringify(claudeSettings, null, 2), "utf8");
    console.log(`Claude Code MCP config written to ${claudeSettingsPath}`);
    break; // write to the first one found
  }
}

async function runMcp() {
  if (!fs.existsSync(CONFIG_FILE)) {
    console.error("Learning Service not set up. Run this once to get started:\n\n  npx github:UTPAL-GAURAV/Learning-Service\n");
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

  writeMCPConfigs();

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
