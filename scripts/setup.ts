import * as http from "http";
import * as https from "https";
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import { exec } from "child_process";

const LOCAL_PORT = 9876;
const VERCEL_URL = process.env.LEARNING_MCP_URL?.replace("/mcp", "") ?? "";

function prompt(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

function openBrowser(url: string) {
  const cmd =
    process.platform === "darwin"
      ? `open "${url}"`
      : process.platform === "win32"
      ? `start "" "${url}"`
      : `xdg-open "${url}"`;
  exec(cmd);
}

function waitForToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const urlObj = new URL(req.url!, `http://localhost:${LOCAL_PORT}`);
      const token = urlObj.searchParams.get("token");
      if (token) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(
          "<html><body><h2>Authentication successful! You can close this tab.</h2></body></html>"
        );
        server.close();
        resolve(token);
      } else {
        res.writeHead(400);
        res.end("Missing token");
        reject(new Error("No token in callback"));
      }
    });
    server.listen(LOCAL_PORT, () => {
      console.log(`Waiting for OAuth callback on http://localhost:${LOCAL_PORT}/callback ...`);
    });
    server.on("error", reject);
  });
}

async function apiPut(
  baseUrl: string,
  path: string,
  token: string,
  body: Record<string, string>
): Promise<void> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const url = new URL(path, baseUrl);
    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
        Authorization: `Bearer ${token}`,
      },
    };

    const req = https.request(options, (res) => {
      res.on("data", () => {});
      res.on("end", () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve();
        } else {
          reject(new Error(`PUT ${path} failed with status ${res.statusCode}`));
        }
      });
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

function mergeClaudeSettings(mcpUrl: string, jwt: string) {
  const settingsPath = path.join(
    process.env.HOME ?? "~",
    ".claude",
    "settings.json"
  );

  let settings: Record<string, unknown> = {};
  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    } catch {
      // file corrupt — start fresh
    }
  }

  const mcpServers = (settings.mcpServers as Record<string, unknown>) ?? {};
  mcpServers["learning"] = {
    url: mcpUrl,
    headers: { Authorization: `Bearer ${jwt}` },
  };
  settings.mcpServers = mcpServers;

  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf8");
  console.log(`\nMCP config written to ${settingsPath}`);
}

async function main() {
  if (!VERCEL_URL) {
    console.error(
      "Error: Set LEARNING_MCP_URL in your environment or .env before running setup.\n" +
        "Example: LEARNING_MCP_URL=https://your-app.vercel.app/mcp npx ts-node scripts/setup.ts"
    );
    process.exit(1);
  }

  const baseUrl = VERCEL_URL;
  const mcpUrl = `${baseUrl}/mcp`;
  const authUrl = `${baseUrl}/auth/google?state=${LOCAL_PORT}`;

  console.log("\nOpening Google login in your browser...");
  openBrowser(authUrl);

  const jwt = await waitForToken();
  console.log("\nAuthentication successful!");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const role = await prompt(
    rl,
    '\nWhat are you learning for? (e.g. SDE-2 interviews, UX role switch, QA prep)\n> '
  );
  const levelRaw = await prompt(
    rl,
    "\nLevel? (beginner / intermediate / senior)\n> "
  );
  rl.close();

  const level = ["beginner", "intermediate", "senior"].includes(levelRaw.trim().toLowerCase())
    ? levelRaw.trim().toLowerCase()
    : "intermediate";

  await apiPut(baseUrl, "/api/me", jwt, { role: role.trim(), level });
  console.log("\nProfile updated.");

  // Write .env in current working directory
  const envPath = path.join(process.cwd(), ".env");
  const envLines: string[] = [];
  if (fs.existsSync(envPath)) {
    const existing = fs.readFileSync(envPath, "utf8");
    const filtered = existing
      .split("\n")
      .filter(
        (l) => !l.startsWith("LEARNING_TOKEN=") && !l.startsWith("LEARNING_MCP_URL=")
      );
    envLines.push(...filtered);
  }
  envLines.push(`LEARNING_TOKEN=${jwt}`);
  envLines.push(`LEARNING_MCP_URL=${mcpUrl}`);
  fs.writeFileSync(envPath, envLines.join("\n") + "\n", "utf8");
  console.log(`\n.env written to ${envPath}`);

  mergeClaudeSettings(mcpUrl, jwt);

  console.log(
    "\nDone. Open VS Code, start a new Claude session, and say:\n" +
      "  Start a learning session on [your topic]\n"
  );
}

main().catch((err) => {
  console.error("Setup failed:", err.message);
  process.exit(1);
});
