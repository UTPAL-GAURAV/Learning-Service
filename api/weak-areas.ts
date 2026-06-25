import express, { Request, Response } from "express";
import { verifyToken, extractBearerToken } from "../lib/auth";
import { sql } from "../lib/db";

const router = express.Router();

function requireAuth(req: Request, res: Response): string | null {
  try {
    const token = extractBearerToken(req.headers.authorization);
    return verifyToken(token).userId;
  } catch {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
}

// GET /api/weak-areas
router.get("/", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { topic } = req.query;
  const rows = topic
    ? await sql`
        SELECT id, topic_slug, sub_topic, description, last_updated
        FROM weak_areas
        WHERE user_id = ${userId} AND topic_slug = ${topic as string}
        ORDER BY last_updated DESC
      `
    : await sql`
        SELECT id, topic_slug, sub_topic, description, last_updated
        FROM weak_areas
        WHERE user_id = ${userId}
        ORDER BY last_updated DESC
      `;
  res.json(rows);
});

export default router;
