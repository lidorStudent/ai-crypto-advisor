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
app.use(cors({ origin: true }));
app.use(express.json());

// Tiny request logger
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

/* ──────────────────────────
   Root + Health (no auth)
   ────────────────────────── */
app.get("/", (_req, res) => {
  res.type("text/plain").send("AI Crypto Advisor API is running. Try GET /health");
});

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

app.use("/api/auth", authRoutes);
app.use("/api/preferences", preferencesRoutes);
app.use("/api/onboarding", preferencesRoutes); // alias
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/feedback", feedbackRoutes);

/* ──────────────────────────
   404 + error handling
   ────────────────────────── */
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

/* ──────────────────────────
   Crash guards
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
    if (typeof db.init === "function") {
      // supports sync or async init
      await db.init();
    }

    // Helpful DB location log (works with your DB_FILE env or default)
    const dbPath = process.env.DB_FILE || "(default ./database.sqlite)";
    console.log("DB_FILE:", dbPath);

    app.listen(port, "0.0.0.0", () => {
      console.log(`Server listening on http://localhost:${port}`);
    });
  } catch (e) {
    console.error("Failed to start server:", e);
    process.exit(1);
  }
})();