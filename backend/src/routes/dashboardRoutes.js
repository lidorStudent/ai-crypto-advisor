// backend/src/routes/dashboardRoutes.js

const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");

const {
  getDashboard,
  fetchPrices,
  getNewsCachedHandler,
  refreshNewsHandler,
  getMemeHandler,
  getRandomMeme,
  getRandomMemeForUser, // personalized picker (uses user prefs)
} = require("../controllers/dashboardController");
const { getPreferencesByUser } = require("../db");

/* -----------------------------------------------------------
   GET /api/dashboard
   Full dashboard payload (news, prices, AI, meme) for this user.
   Note: news is served from a per-user cache; refresh via /news/refresh.
----------------------------------------------------------- */
router.get("/", auth, (req, res, next) => {
  res.setHeader("Cache-Control", "no-store"); // avoid stale UI
  return getDashboard(req, res, next);
});

/* -----------------------------------------------------------
   GET /api/dashboard/prices
   Polled by the Prices tab. Uses user prefs (assets) or defaults.
----------------------------------------------------------- */
router.get("/prices", auth, async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const prefsRow = await getPreferencesByUser(req.userId);
    const assets = prefsRow?.assets
      ? JSON.parse(prefsRow.assets)
      : ["bitcoin", "ethereum"]; // safe default
    const prices = await fetchPrices(assets);
    res.json(prices);
  } catch (err) {
    console.error("[prices] error:", err);
    res.status(500).json({}); // keep client resilient
  }
});

/* -----------------------------------------------------------
   GET /api/dashboard/news
   Returns per-user sticky news (does not hit the provider).
   Use /news/refresh to fetch fresh headlines.
----------------------------------------------------------- */
router.get("/news", auth, getNewsCachedHandler);

/* -----------------------------------------------------------
   POST /api/dashboard/news/refresh
   Manually refresh headlines for THIS user (rate-limited).
   Also exposed as GET for compatibility.
----------------------------------------------------------- */
router.post("/news/refresh", auth, refreshNewsHandler);
// Optional alias (some UIs might call GET):
router.get("/news/refresh", auth, refreshNewsHandler);

/* -----------------------------------------------------------
   GET /api/dashboard/meme
   Returns a personalized meme for the user (falls back to generic).
----------------------------------------------------------- */
router.get("/meme", auth, getMemeHandler);
router.get("/meme", auth, async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const prefsRow = await getPreferencesByUser(req.userId);
    const parsedPrefs = prefsRow
      ? {
          assets: prefsRow.assets ? JSON.parse(prefsRow.assets) : [],
          investorType: prefsRow.investor_type || "",
          contentTypes: prefsRow.content_types
            ? JSON.parse(prefsRow.content_types)
            : [],
        }
      : null;

    // Prefer personalized; fall back to generic if anything fails.
    try {
      const m = await getRandomMemeForUser(req.userId, parsedPrefs || {});
      return res.json(m);
    } catch (e) {
      console.warn("[meme] personalized picker failed, falling back:", e.message);
      const m = await getRandomMeme();
      return res.json(m);
    }
  } catch (err) {
    console.error("[meme] error:", err);
    // Last-resort static payload (keeps UI alive)
    res.json({
      id: "meme-fallback",
      title: "Crypto vibes ✨",
      img: "/memes/meme1.jpg",
      source: "static",
    });
  }
});

module.exports = router;