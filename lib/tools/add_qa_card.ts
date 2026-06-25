import { sql } from "../db";

export interface QACardInput {
  id: string;
  question: string;
  answer: string;
  difficulty: "easy" | "medium" | "hard";
  tags: string[];
}

export async function addQACard(
  userId: string,
  topicSlug: string,
  card: QACardInput
) {
  const sessionRows = await sql`
    SELECT id FROM sessions WHERE user_id = ${userId} AND topic_slug = ${topicSlug}
  `;
  if (!sessionRows[0]) throw new Error(`Session not found: ${topicSlug}`);
  const sessionId = (sessionRows[0] as { id: string }).id;

  const rows = await sql`
    INSERT INTO qa_cards (id, session_id, user_id, question, answer, difficulty, tags)
    VALUES (
      ${card.id},
      ${sessionId},
      ${userId},
      ${card.question},
      ${card.answer},
      ${card.difficulty},
      ${JSON.stringify(card.tags)}
    )
    RETURNING id, question, answer, difficulty, tags, attempts, wrong_count, last_reviewed, created_at
  `;

  return rows[0];
}
