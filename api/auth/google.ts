import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAuthUrl } from "../../lib/auth";

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.redirect(302, getAuthUrl());
}
