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

// GET /api/sessions
router.get("/", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const rows = await sql`
    SELECT
      s.id, s.topic_slug, s.topic_name, s.readiness_score,
      s.syllabus_topics, s.covered_topics, s.pending_topics,
      s.key_concepts, s.notes, s.created_at, s.updated_at,
      (SELECT score FROM score_history
       WHERE user_id = ${userId} AND topic_slug = s.topic_slug
       ORDER BY date DESC LIMIT 1) AS last_score,
      (SELECT COUNT(*) FROM weak_areas
       WHERE user_id = ${userId} AND topic_slug = s.topic_slug) AS weak_area_count
    FROM sessions s
    WHERE s.user_id = ${userId}
    ORDER BY s.updated_at DESC
  `;
  res.json(rows);
});

// GET /api/sessions/:topicSlug
router.get("/:topicSlug", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const rows = await sql`
    SELECT
      id, topic_slug, topic_name, notes, readiness_score,
      syllabus_topics, covered_topics, pending_topics, key_concepts,
      created_at, updated_at
    FROM sessions
    WHERE user_id = ${userId} AND topic_slug = ${req.params.topicSlug}
  `;
  if (!rows[0]) { res.status(404).json({ error: "Session not found" }); return; }
  res.json(rows[0]);
});

// GET /api/sessions/:topicSlug/scores
router.get("/:topicSlug/scores", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const rows = await sql`
    SELECT id, topic_slug, date, score, note, created_at
    FROM score_history
    WHERE user_id = ${userId} AND topic_slug = ${req.params.topicSlug}
    ORDER BY date DESC
  `;
  res.json(rows);
});

export default router;
