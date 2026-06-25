import express, { Request, Response } from "express";
import { verifyToken, extractBearerToken } from "../lib/auth";
import { sql } from "../lib/db";

const router = express.Router();

async function getUser(userId: string) {
  const rows = await sql`
    SELECT id, name, email, role, level, learning_goal
    FROM users WHERE id = ${userId}
  `;
  if (!rows[0]) return null;
  const u = rows[0] as {
    id: string;
    name: string;
    email: string;
    role: string | null;
    level: string | null;
    learning_goal: string | null;
  };
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    level: u.level,
    learningGoal: u.learning_goal,
  };
}

function requireAuth(req: Request, res: Response): string | null {
  try {
    const token = extractBearerToken(req.headers.authorization);
    return verifyToken(token).userId;
  } catch {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
}

router.get("/", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const user = await getUser(userId);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json(user);
});

router.put("/", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { role, level, learningGoal } = req.body as {
    role?: string;
    level?: string;
    learningGoal?: string;
  };

  await sql`
    UPDATE users
    SET
      role         = COALESCE(${role ?? null}, role),
      level        = COALESCE(${level ?? null}, level),
      learning_goal = COALESCE(${learningGoal ?? null}, learning_goal)
    WHERE id = ${userId}
  `;

  const user = await getUser(userId);
  res.json(user);
});

export default router;
