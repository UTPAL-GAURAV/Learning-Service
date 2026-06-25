import express from "express";
import { exchangeCodeForUser, signToken } from "../../lib/auth";
import { sql } from "../../lib/db";

const router = express.Router();

router.get("/", async (req, res) => {
  const { code, state } = req.query;

  if (!code || typeof code !== "string") {
    res.status(400).json({ error: "Missing code parameter" });
    return;
  }

  try {
    const { googleId, email, name } = await exchangeCodeForUser(code);

    const rows = await sql`
      INSERT INTO users (google_id, email, name)
      VALUES (${googleId}, ${email}, ${name})
      ON CONFLICT (google_id) DO UPDATE
        SET email = EXCLUDED.email, name = EXCLUDED.name
      RETURNING id, email
    `;

    const user = rows[0] as { id: string; email: string };
    const token = signToken({ userId: user.id, email: user.email });

    const port =
      typeof state === "string" && /^\d+$/.test(state) ? state : "9876";
    res.redirect(302, `http://localhost:${port}/callback?token=${token}`);
  } catch (err) {
    console.error("OAuth callback error", err);
    res.status(500).json({ error: "Authentication failed" });
  }
});

export default router;
