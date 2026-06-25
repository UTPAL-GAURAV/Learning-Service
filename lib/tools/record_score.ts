import { sql } from "../db";

export async function recordScore(
  userId: string,
  topicSlug: string,
  score: number,
  note?: string
) {
  const rows = await sql`
    INSERT INTO score_history (user_id, topic_slug, date, score, note)
    VALUES (${userId}, ${topicSlug}, CURRENT_DATE, ${score}, ${note ?? null})
    RETURNING id, topic_slug, date, score, note, created_at
  `;
  return rows[0];
}
