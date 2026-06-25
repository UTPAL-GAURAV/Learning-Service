import express from "express";
import { getAuthUrl } from "../../lib/auth";

const router = express.Router();

router.get("/", (req, res) => {
  const state = typeof req.query.state === "string" ? req.query.state : undefined;
  res.redirect(302, getAuthUrl(state));
});

export default router;
