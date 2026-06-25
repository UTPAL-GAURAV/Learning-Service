#!/usr/bin/env node
import * as http from "http";
import * as https from "https";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as readline from "readline";
import * as net from "net";
import { exec } from "child_process";

const BACKEND = "https://learning-service-yys6.onrender.com";
const CONFIG_DIR = path.join(os.homedir(), ".learning-service");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

function openBrowser(url: string) {
  const cmd =
    process.platform === "darwin"
      ? `open "${url}"`
      : process.platform === "win32"
      ? `start "" "${url}"`
      : `xdg-open "${url}"`;
  exec(cmd);
}

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const addr = srv.address() as net.AddressInfo;
      srv.close(() => resolve(addr.port));
    });
    srv.on("error", reject);
  });
}

function waitForToken(port: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url!, `http://localhost:${port}`);
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

function prompt(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, (ans) => resolve(ans.trim())));
}

function apiPut(path: string, token: string, body: Record<string, string>): Promise<void> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const url = new URL(path, BACKEND);
    const req = https.request(
      { hostname: url.hostname, path: url.pathname, method: "PUT", headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
          Authorization: `Bearer ${token}`,
        },
      },
      (res) => {
        res.resume();
        res.on("end", () =>
          res.statusCode && res.statusCode < 300 ? resolve() : reject(new Error(`PUT ${path} → ${res.statusCode}`))
        );
      }
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

function writeVSCodeMCPConfig(token: string) {
  // Try global VS Code settings first, then cursor, then fall back to creating it
  const candidates = [
    path.join(os.homedir(), "Library", "Application Support", "Code", "User", "settings.json"),
    path.join(os.homedir(), ".config", "Code", "User", "settings.json"),
    path.join(os.homedir(), "Library", "Application Support", "Cursor", "User", "settings.json"),
    path.join(os.homedir(), ".config", "Cursor", "User", "settings.json"),
  ];

  const settingsPath = candidates.find((p) => fs.existsSync(p)) ?? candidates[0];

  let settings: Record<string, unknown> = {};
  if (fs.existsSync(settingsPath)) {
    try { settings = JSON.parse(fs.readFileSync(settingsPath, "utf8")); } catch { /* corrupt */ }
  }

  const mcpServers = (settings["mcp.servers"] as Record<string, unknown>) ?? {};
  mcpServers["learning"] = {
    command: "npx",
    args: ["github:utpalgaurav/learning-service", "--mcp"],
  };
  settings["mcp.servers"] = mcpServers;

  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf8");
  console.log(`\nMCP config written to ${settingsPath}`);
}

async function main() {
  const isMcpMode = process.argv.includes("--mcp");

  if (isMcpMode) {
    // Load token and start MCP server
    if (!fs.existsSync(CONFIG_FILE)) {
      console.error("Not set up. Run: npx github:utpalgaurav/learning-service");
      process.exit(1);
    }
    const { token } = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")) as { token: string };
    const { startMcpServer } = await import("./mcp-server");
    await startMcpServer(token);
    return;
  }

  // ── Setup flow ──
  const port = await getFreePort();
  console.log("\nOpening Google login in your browser...");
  openBrowser(`${BACKEND}/auth/google?state=${port}`);

  const token = await waitForToken(port);
  console.log("\nAuthentication successful!");

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const role = await prompt(rl, "\nWhat's your role? (e.g. SDE-2, UX Designer, QA Engineer)\n> ");
  const learningGoal = await prompt(rl, "\nWhat are you learning for? (e.g. FAANG interview, promotion, skill gap)\n> ");
  const levelRaw = await prompt(rl, "\nLevel? (beginner / intermediate / senior)\n> ");
  rl.close();

  const level = ["beginner", "intermediate", "senior"].includes(levelRaw.toLowerCase())
    ? levelRaw.toLowerCase()
    : "intermediate";

  await apiPut("/api/me", token, { role, learningGoal, level });

  // Save config
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify({ token, backend: BACKEND }, null, 2), "utf8");
  console.log(`\nToken saved to ${CONFIG_FILE}`);

  writeVSCodeMCPConfig(token);

  console.log("\nAll done! Open your project folder in VS Code and start a Claude session.");
  console.log('Try: "Start a learning session on system design"\n');
}

main().catch((err) => {
  console.error("Setup failed:", err.message);
  process.exit(1);
});
