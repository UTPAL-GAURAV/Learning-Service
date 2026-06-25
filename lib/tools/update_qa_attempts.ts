import { sql } from "../db";

export interface Attempt {
  timestamp: string;
  correct: boolean;
}

export async function updateQAAttempts(cardId: string, attempt: Attempt) {
  const rows = await sql`
    UPDATE qa_cards
    SET
      attempts     = attempts || ${JSON.stringify([attempt])}::jsonb,
      wrong_count  = wrong_count + ${attempt.correct ? 0 : 1},
      last_reviewed = now()
    WHERE id = ${cardId}
    RETURNING id, attempts, wrong_count, last_reviewed
  `;

  if (!rows[0]) throw new Error(`QA card not found: ${cardId}`);
  return rows[0];
}
