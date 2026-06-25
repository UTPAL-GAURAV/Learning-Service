import { sql } from "../db";

export async function getSession(userId: string, topicSlug: string) {
  const rows = await sql`
    SELECT
      id, topic_slug, topic_name, notes, readiness_score,
      syllabus_topics, covered_topics, pending_topics, key_concepts,
      created_at, updated_at
    FROM sessions
    WHERE user_id = ${userId} AND topic_slug = ${topicSlug}
  `;
  if (!rows[0]) return null;

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
