import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

const rawSql = neon(process.env.DATABASE_URL);

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 4000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Wraps rawSql so every query retries up to MAX_RETRIES times on transient
// failures (e.g. Neon free-tier cold-start / connection errors).
export const sql = new Proxy(rawSql, {
  apply: async (target, thisArg, args) => {
    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await Reflect.apply(target, thisArg, args);
      } catch (err) {
        lastError = err;
        if (attempt < MAX_RETRIES) {
          console.warn(
            `DB query failed (attempt ${attempt}/${MAX_RETRIES}), retrying in ${RETRY_DELAY_MS / 1000}s…`,
            err
          );
          await sleep(RETRY_DELAY_MS);
        }
      }
    }
    throw lastError;
  },
}) as typeof rawSql;
