// backend/src/routes/feedbackRoutes.js

const express = require("express");
const auth = require("../middleware/auth");
const {
  queryFeedback,
  setFeedback,
  clearFeedbackHandler,
  saveFeedback, // legacy (acts like /set)
} = require("../controllers/feedbackController");

const router = express.Router();

/* ---------------------------------------------
   GET /api/feedback/query?type=...&ids=a,b,c
   Read votes for specific IDs (to render pressed states).
--------------------------------------------- */
router.get("/query", auth, queryFeedback);

/* ---------------------------------------------
   POST /api/feedback/set
   Toggle/set a vote with XOR semantics:
   - 1 = like, -1 = dislike
   - pressing the same value again clears (0)
--------------------------------------------- */
router.post("/set", auth, setFeedback);

/* ---------------------------------------------
   POST /api/feedback/clear
   Explicitly clear a vote for one target.
--------------------------------------------- */
router.post("/clear", auth, clearFeedbackHandler);

/* ---------------------------------------------
   POST /api/feedback
   Legacy endpoint kept for compatibility.
   Behaves like /set (same toggle rules).
--------------------------------------------- */
router.post("/", auth, saveFeedback);

module.exports = router;