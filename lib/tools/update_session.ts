import { sql } from "../db";

export interface SessionPatch {
  notes?: string;
  readinessScore?: number;
  coveredTopics?: unknown[];
  pendingTopics?: unknown[];
  keyConcepts?: unknown[];
}

export async function updateSession(
  userId: string,
  topicSlug: string,
  patch: SessionPatch
) {
  const rows = await sql`
    UPDATE sessions SET
      notes           = COALESCE(${patch.notes ?? null}, notes),
      readiness_score = COALESCE(${patch.readinessScore ?? null}, readiness_score),
      covered_topics  = COALESCE(${patch.coveredTopics ? JSON.stringify(patch.coveredTopics) : null}::jsonb, covered_topics),
      pending_topics  = COALESCE(${patch.pendingTopics ? JSON.stringify(patch.pendingTopics) : null}::jsonb, pending_topics),
      key_concepts    = COALESCE(${patch.keyConcepts ? JSON.stringify(patch.keyConcepts) : null}::jsonb, key_concepts),
      updated_at      = now()
    WHERE user_id = ${userId} AND topic_slug = ${topicSlug}
    RETURNING
      id, topic_slug, topic_name, notes, readiness_score,
      syllabus_topics, covered_topics, pending_topics, key_concepts,
      created_at, updated_at
  `;

  if (!rows[0]) throw new Error(`Session not found: ${topicSlug}`);

  const r = rows[0] as {
    id: string;
    topic_slug: string;
    topic_name: string;
    notes: string;
    readiness_score: number;
    syllabus_topics: unknown[];
    covered_topics: unknown[];
    pending_topics: unknown[];
    key_concepts: unknown[];
    created_at: string;
    updated_at: string;
  };

  return {
    id: r.id,
    topicSlug: r.topic_slug,
    topicName: r.topic_name,
    notes: r.notes,
    readinessScore: r.readiness_score,
    syllabusTopics: r.syllabus_topics,
    coveredTopics: r.covered_topics,
    pendingTopics: r.pending_topics,
    keyConcepts: r.key_concepts,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
