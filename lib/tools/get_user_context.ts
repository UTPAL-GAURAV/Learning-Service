import { sql } from "../db";

export async function getUserContext(userId: string) {
  const userRows = await sql`
    SELECT id, name, email, role, level, learning_goal FROM users WHERE id = ${userId}
  `;
  if (!userRows[0]) throw new Error("User not found");

  const u = userRows[0] as {
    id: string;
    name: string;
    email: string;
    role: string | null;
    level: string | null;
    learning_goal: string | null;
  };

  const sessionRows = await sql`
    SELECT
      s.topic_slug,
      s.topic_name,
      s.readiness_score,
      s.updated_at,
      (SELECT score FROM score_history
       WHERE user_id = ${userId} AND topic_slug = s.topic_slug
       ORDER BY date DESC LIMIT 1) AS last_score_date,
      (SELECT COUNT(*) FROM weak_areas
       WHERE user_id = ${userId} AND topic_slug = s.topic_slug) AS weak_area_count
    FROM sessions s
    WHERE s.user_id = ${userId}
    ORDER BY s.updated_at DESC
  `;

  return {
    user: {
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      level: u.level,
      learningGoal: u.learning_goal,
    },
    sessions: sessionRows.map((r) => {
      const row = r as {
        topic_slug: string;
        topic_name: string;
        readiness_score: number;
        updated_at: string;
        last_score_date: string | null;
        weak_area_count: string;
      };
      return {
        topicSlug: row.topic_slug,
        topicName: row.topic_name,
        readinessScore: row.readiness_score,
        lastUpdated: row.updated_at,
        lastScoreDate: row.last_score_date,
        weakAreaCount: parseInt(row.weak_area_count, 10),
      };
    }),
  };
}
