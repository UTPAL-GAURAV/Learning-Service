import type { VercelRequest, VercelResponse } from "@vercel/node";
import { exchangeCodeForUser, signToken } from "../../lib/auth";
import { sql } from "../../lib/db";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { code, state } = req.query;

  if (!code || typeof code !== "string") {
    return res.status(400).json({ error: "Missing code parameter" });
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

    // Redirect back to local setup script callback server
    // state param carries the local port if provided
    const port = typeof state === "string" && /^\d+$/.test(state) ? state : "9876";
    return res.redirect(302, `http://localhost:${port}/callback?token=${token}`);
  } catch (err) {
    console.error("OAuth callback error", err);
    return res.status(500).json({ error: "Authentication failed" });
  }
}
