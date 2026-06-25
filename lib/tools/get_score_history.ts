import { sql } from "../db";

export async function getScoreHistory(userId: string, topicSlug?: string) {
  const rows = topicSlug
    ? await sql`
        SELECT id, topic_slug, date, score, note, created_at
        FROM score_history
        WHERE user_id = ${userId} AND topic_slug = ${topicSlug}
        ORDER BY date DESC
      `
    : await sql`
        SELECT id, topic_slug, date, score, note, created_at
        FROM score_history
        WHERE user_id = ${userId}
        ORDER BY date DESC
      `;

  return rows;
}
