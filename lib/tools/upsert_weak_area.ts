import { sql } from "../db";

export async function upsertWeakArea(
  userId: string,
  topicSlug: string,
  subTopic: string,
  description: string
) {
  const rows = await sql`
    INSERT INTO weak_areas (user_id, topic_slug, sub_topic, description, last_updated)
    VALUES (${userId}, ${topicSlug}, ${subTopic}, ${description}, now())
    ON CONFLICT (user_id, topic_slug, sub_topic) DO UPDATE
      SET description = EXCLUDED.description, last_updated = now()
    RETURNING id, topic_slug, sub_topic, description, last_updated
  `;
  return rows[0];
}
