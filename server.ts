import express from "express";
import cors from "cors";
import googleRouter from "./api/auth/google";
import callbackRouter from "./api/auth/callback";
import meRouter from "./api/me";
import sessionsRouter from "./api/sessions";
import weakAreasRouter from "./api/weak-areas";

const app = express();
const PORT = process.env.PORT || 3000;
const FRONTEND_URL = process.env.FRONTEND_URL ?? "https://lumen-prep.vercel.app/";

app.use(cors({ origin: FRONTEND_URL, credentials: true }));
app.use(express.json());

app.use("/auth/google", googleRouter);
app.use("/auth/callback", callbackRouter);
app.use("/api/me", meRouter);
app.use("/api/sessions", sessionsRouter);
app.use("/api/cards", sessionsRouter);  // PATCH /api/cards/:cardId/attempts
app.use("/api/weak-areas", weakAreasRouter);

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.listen(PORT, () => {
  console.log(`Learning-Service running on port ${PORT}`);
});
