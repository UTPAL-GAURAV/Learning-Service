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

// PUT /api/weak-areas/:topicSlug/:subTopic
router.put("/:topicSlug/:subTopic", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { description } = req.body as { description: string };
  const { topicSlug, subTopic } = req.params;

  const rows = await sql`
    INSERT INTO weak_areas (user_id, topic_slug, sub_topic, description, last_updated)
    VALUES (${userId}, ${topicSlug}, ${subTopic}, ${description}, now())
    ON CONFLICT (user_id, topic_slug, sub_topic) DO UPDATE
      SET description = EXCLUDED.description, last_updated = now()
    RETURNING id, topic_slug, sub_topic, description, last_updated
  `;
  res.json(rows[0]);
});

// DELETE /api/weak-areas/:topicSlug/:subTopic
router.delete("/:topicSlug/:subTopic", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  await sql`
    DELETE FROM weak_areas
    WHERE user_id = ${userId}
      AND topic_slug = ${req.params.topicSlug}
      AND sub_topic = ${req.params.subTopic}
  `;
  res.status(204).send();
});

export default router;
