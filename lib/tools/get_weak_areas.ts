import { sql } from "../db";

export async function getWeakAreas(userId: string, topicSlug?: string) {
  const rows = topicSlug
    ? await sql`
        SELECT id, topic_slug, sub_topic, description, last_updated
        FROM weak_areas
        WHERE user_id = ${userId} AND topic_slug = ${topicSlug}
        ORDER BY last_updated DESC
      `
    : await sql`
        SELECT id, topic_slug, sub_topic, description, last_updated
        FROM weak_areas
        WHERE user_id = ${userId}
        ORDER BY last_updated DESC
      `;

  return rows;
}
