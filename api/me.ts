import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyToken, extractBearerToken } from "../lib/auth";
import { sql } from "../lib/db";

async function getMe(userId: string) {
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  let userId: string;
  try {
    const token = extractBearerToken(req.headers.authorization);
    ({ userId } = verifyToken(token));
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (req.method === "GET") {
    const user = await getMe(userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    return res.status(200).json(user);
  }

  if (req.method === "PUT") {
    const { role, level, learningGoal } = req.body as {
      role?: string;
      level?: string;
      learningGoal?: string;
    };

    await sql`
      UPDATE users
      SET
        role = COALESCE(${role ?? null}, role),
        level = COALESCE(${level ?? null}, level),
        learning_goal = COALESCE(${learningGoal ?? null}, learning_goal)
      WHERE id = ${userId}
    `;

    const user = await getMe(userId);
    return res.status(200).json(user);
  }

  return res.status(405).json({ error: "Method not allowed" });
}
