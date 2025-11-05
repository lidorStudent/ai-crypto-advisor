// backend/src/index.js

const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const db = require("./db"); // exposes db.init()

dotenv.config();

const app = express();
const port = Number(process.env.PORT) || 4000;

/* ──────────────────────────
   Global middlewares
   ────────────────────────── */
// Allow browser clients (dev-friendly default). Tighten in prod if needed.
app.use(cors({ origin: true }));
// Parse JSON bodies (default limit is fine for our use-case).
app.use(express.json());

// Tiny request logger (great for spotting wrong ports/hosts in dev)
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

/* ──────────────────────────
   Health check (no auth)
   ────────────────────────── */
app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "api", time: new Date().toISOString() });
});

/* ──────────────────────────
   Routes
   ────────────────────────── */
const authRoutes = require("./routes/authRoutes");
const preferencesRoutes = require("./routes/preferencesRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const feedbackRoutes = require("./routes/feedbackRoutes");

// Auth (login/register)
app.use("/api/auth", authRoutes);
// User onboarding/preferences (GET/POST)
app.use("/api/preferences", preferencesRoutes);
// Alias used by the client during onboarding flows
app.use("/api/onboarding", preferencesRoutes);
// Dashboard (news/prices/ai/memes)
app.use("/api/dashboard", dashboardRoutes);
// Like/Dislike feedback
app.use("/api/feedback", feedbackRoutes);

/* ──────────────────────────
   404 + error handling
   ────────────────────────── */
// Fallback for unknown endpoints
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Catch-all error handler (keep messages generic for clients)
app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

/* ──────────────────────────
   Crash guards (log and exit)
   ────────────────────────── */
process.on("unhandledRejection", (reason) => {
  console.error("unhandledRejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("uncaughtException:", err);
  process.exit(1);
});

/* ──────────────────────────
   Start server
   ────────────────────────── */
(async () => {
  try {
    // Initialize DB schema (safe to call multiple times).
    if (typeof db.init === "function") {
      await db.init(); // supports sync or async init
    }
    app.listen(port, "0.0.0.0", () => {
      console.log(`Server listening on http://localhost:${port}`);
    });
  } catch (e) {
    console.error("Failed to start server:", e);
    process.exit(1);
  }
})();