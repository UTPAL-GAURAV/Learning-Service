import express from "express";
import googleRouter from "./api/auth/google";
import callbackRouter from "./api/auth/callback";
import meRouter from "./api/me";
import mcpRouter from "./api/mcp";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.use("/auth/google", googleRouter);
app.use("/auth/callback", callbackRouter);
app.use("/api/me", meRouter);
app.use("/mcp", mcpRouter);

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.listen(PORT, () => {
  console.log(`Learning-Service running on port ${PORT}`);
});
