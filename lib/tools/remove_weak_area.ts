import { sql } from "../db";

export async function removeWeakArea(
  userId: string,
  topicSlug: string,
  subTopic: string
) {
  await sql`
    DELETE FROM weak_areas
    WHERE user_id = ${userId} AND topic_slug = ${topicSlug} AND sub_topic = ${subTopic}
  `;
  return { deleted: true };
}
