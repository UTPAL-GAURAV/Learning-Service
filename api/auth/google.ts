import express from "express";
import { getAuthUrl } from "../../lib/auth";

const router = express.Router();

router.get("/", (_req, res) => {
  res.redirect(302, getAuthUrl());
});

export default router;
