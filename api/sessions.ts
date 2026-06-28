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
       WHERE user_id = ${userId} AND topic_slug = s.topic_slug) AS weak_area_count,
      (SELECT COUNT(*) FROM qa_cards
       WHERE user_id = ${userId} AND session_id = s.id) AS qa_count
    FROM sessions s
    WHERE s.user_id = ${userId}
    ORDER BY s.updated_at DESC
  `;
  res.json(rows);
});

// POST /api/sessions
router.post("/", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { topicSlug, topicName, syllabusTopics = [] } = req.body as {
    topicSlug: string;
    topicName: string;
    syllabusTopics?: string[];
  };

  if (!topicSlug || !topicName) {
    res.status(400).json({ error: "topicSlug and topicName are required" });
    return;
  }

  const rows = await sql`
    INSERT INTO sessions (user_id, topic_slug, topic_name, syllabus_topics, pending_topics)
    VALUES (
      ${userId}, ${topicSlug}, ${topicName},
      ${JSON.stringify(syllabusTopics)},
      ${JSON.stringify(syllabusTopics)}
    )
    ON CONFLICT (user_id, topic_slug) DO UPDATE
      SET topic_name = EXCLUDED.topic_name, updated_at = now()
    RETURNING
      id, topic_slug, topic_name, notes, readiness_score,
      syllabus_topics, covered_topics, pending_topics, key_concepts,
      created_at, updated_at
  `;
  res.status(201).json(rows[0]);
});

// GET /api/sessions/:topicSlug/cards
router.get("/:topicSlug/cards", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const sessionRows = await sql`
    SELECT id FROM sessions WHERE user_id = ${userId} AND topic_slug = ${req.params.topicSlug}
  `;
  if (!sessionRows[0]) { res.status(404).json({ error: "Session not found" }); return; }
  const sessionId = (sessionRows[0] as { id: string }).id;

  const rows = await sql`
    SELECT id, question, answer, difficulty, tags, attempts, wrong_count, last_reviewed, created_at
    FROM qa_cards
    WHERE session_id = ${sessionId} AND user_id = ${userId}
    ORDER BY created_at ASC
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

// PATCH /api/sessions/:topicSlug
router.patch("/:topicSlug", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { notes, readinessScore, coveredTopics, pendingTopics, keyConcepts } = req.body as {
    notes?: string;
    readinessScore?: number;
    coveredTopics?: unknown[];
    pendingTopics?: unknown[];
    keyConcepts?: unknown[];
  };

  const rows = await sql`
    UPDATE sessions SET
      notes           = COALESCE(${notes ?? null}, notes),
      readiness_score = COALESCE(${readinessScore ?? null}, readiness_score),
      covered_topics  = COALESCE(${coveredTopics ? JSON.stringify(coveredTopics) : null}::jsonb, covered_topics),
      pending_topics  = COALESCE(${pendingTopics ? JSON.stringify(pendingTopics) : null}::jsonb, pending_topics),
      key_concepts    = COALESCE(${keyConcepts ? JSON.stringify(keyConcepts) : null}::jsonb, key_concepts),
      updated_at      = now()
    WHERE user_id = ${userId} AND topic_slug = ${req.params.topicSlug}
    RETURNING
      id, topic_slug, topic_name, notes, readiness_score,
      syllabus_topics, covered_topics, pending_topics, key_concepts,
      created_at, updated_at
  `;
  if (!rows[0]) { res.status(404).json({ error: "Session not found" }); return; }
  res.json(rows[0]);
});

// POST /api/sessions/:topicSlug/cards
router.post("/:topicSlug/cards", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const sessionRows = await sql`
    SELECT id FROM sessions WHERE user_id = ${userId} AND topic_slug = ${req.params.topicSlug}
  `;
  if (!sessionRows[0]) { res.status(404).json({ error: "Session not found" }); return; }
  const sessionId = (sessionRows[0] as { id: string }).id;

  const { id, question, answer, difficulty, tags = [] } = req.body as {
    id: string;
    question: string;
    answer: string;
    difficulty: "easy" | "medium" | "hard";
    tags?: string[];
  };

  const rows = await sql`
    INSERT INTO qa_cards (id, session_id, user_id, question, answer, difficulty, tags)
    VALUES (${id}, ${sessionId}, ${userId}, ${question}, ${answer}, ${difficulty}, ${JSON.stringify(tags)})
    RETURNING id, question, answer, difficulty, tags, attempts, wrong_count, last_reviewed, created_at
  `;
  res.status(201).json(rows[0]);
});

// PUT /api/cards/:cardId
router.put("/cards/:cardId", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { question, answer, difficulty, tags } = req.body as {
    question?: string;
    answer?: string;
    difficulty?: "easy" | "medium" | "hard";
    tags?: string[];
  };

  const rows = await sql`
    UPDATE qa_cards SET
      question   = COALESCE(${question ?? null}, question),
      answer     = COALESCE(${answer ?? null}, answer),
      difficulty = COALESCE(${difficulty ?? null}, difficulty),
      tags       = COALESCE(${tags ? JSON.stringify(tags) : null}::jsonb, tags)
    WHERE id = ${req.params.cardId} AND user_id = ${userId}
    RETURNING id, question, answer, difficulty, tags, attempts, wrong_count, last_reviewed, created_at
  `;
  if (!rows[0]) { res.status(404).json({ error: "Card not found" }); return; }
  res.json(rows[0]);
});

// DELETE /api/cards/:cardId
router.delete("/cards/:cardId", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const rows = await sql`
    DELETE FROM qa_cards WHERE id = ${req.params.cardId} AND user_id = ${userId}
    RETURNING id
  `;
  if (!rows[0]) { res.status(404).json({ error: "Card not found" }); return; }
  res.status(204).send();
});

// PATCH /api/cards/:cardId/attempts
router.patch("/cards/:cardId/attempts", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { timestamp, correct } = req.body as { timestamp: string; correct: boolean };

  const rows = await sql`
    UPDATE qa_cards
    SET
      attempts      = attempts || ${JSON.stringify([{ timestamp, correct }])}::jsonb,
      wrong_count   = wrong_count + ${correct ? 0 : 1},
      last_reviewed = now()
    WHERE id = ${req.params.cardId} AND user_id = ${userId}
    RETURNING id, attempts, wrong_count, last_reviewed
  `;
  if (!rows[0]) { res.status(404).json({ error: "Card not found" }); return; }
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

// POST /api/sessions/:topicSlug/scores
router.post("/:topicSlug/scores", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { score, note } = req.body as { score: number; note?: string };

  const rows = await sql`
    INSERT INTO score_history (user_id, topic_slug, date, score, note)
    VALUES (${userId}, ${req.params.topicSlug}, CURRENT_DATE, ${score}, ${note ?? null})
    RETURNING id, topic_slug, date, score, note, created_at
  `;
  res.status(201).json(rows[0]);
});

export default router;
