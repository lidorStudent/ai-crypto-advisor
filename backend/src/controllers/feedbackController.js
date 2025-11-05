// controllers/feedbackController.js

// Data access helpers (DB layer)
const {
  upsertFeedbackVote,
  clearFeedback,
  getFeedbackForTargets,
} = require("../db");

// Acceptable vote values as numbers
const VOTE_VALUES = new Set([-1, 0, 1]);

/**
 * GET /api/feedback/query?type=...&ids=a,b,c
 * Quick lookup for a user's votes on specific targets.
 * Returns: { votes: { [id]: -1|0|1 } }
 */
async function queryFeedback(req, res) {
  const targetType = String(req.query.type || "");
  const ids = String(req.query.ids || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!targetType || !ids.length) {
    return res.status(400).json({ error: "Missing type or ids" });
  }

  try {
    const map = await getFeedbackForTargets(req.userId, targetType, ids);
    return res.json({ votes: map });
  } catch (err) {
    console.error("[feedback/query] error:", err);
    return res.status(500).json({ error: "Failed to load feedback" });
  }
}

/**
 * POST /api/feedback/set
 * Body: { targetType, targetId, vote } where vote ∈ {-1, 0, 1}
 * Same-vote toggle: sending the same vote again clears it (sets to 0).
 */
async function setFeedback(req, res) {
  const { targetType, targetId } = req.body || {};
  let { vote } = req.body || {};

  // Basic input validation
  const voteNum = Number(vote);
  if (!targetType || !targetId || !VOTE_VALUES.has(voteNum)) {
    return res.status(400).json({ error: "Invalid feedback data" });
  }

  try {
    // Read the current vote for toggle behavior
    const currentMap = await getFeedbackForTargets(
      req.userId,
      String(targetType),
      [String(targetId)]
    );
    const current = Number(currentMap[String(targetId)] || 0);

    // If user clicks the same state again → clear
    const finalVote = current === voteNum ? 0 : voteNum;

    await upsertFeedbackVote(
      req.userId,
      String(targetType),
      String(targetId),
      finalVote
    );

    return res.status(200).json({ success: true, vote: finalVote });
  } catch (err) {
    console.error("[feedback/set] error:", err);
    return res.status(500).json({ error: "Failed to save feedback" });
  }
}

/**
 * POST /api/feedback/clear
 * Body: { targetType, targetId }
 * Explicitly clears the user's vote (sets to 0).
 */
async function clearFeedbackHandler(req, res) {
  const { targetType, targetId } = req.body || {};
  if (!targetType || !targetId) {
    return res.status(400).json({ error: "Missing targetType/targetId" });
  }

  try {
    await clearFeedback(req.userId, String(targetType), String(targetId));
    return res.status(200).json({ success: true, vote: 0 });
  } catch (err) {
    console.error("[feedback/clear] error:", err);
    return res.status(500).json({ error: "Failed to clear feedback" });
  }
}

/**
 * (Legacy) POST /api/feedback
 * Body: { targetType, targetId, vote }
 * Backward-compatible with older clients: behaves like `/set` (with toggle).
 */
async function saveFeedback(req, res) {
  const { targetType, targetId } = req.body || {};
  let { vote } = req.body || {};

  const voteNum = Number(vote);
  if (!targetType || !targetId || !VOTE_VALUES.has(voteNum)) {
    return res.status(400).json({ error: "Invalid feedback data" });
  }

  try {
    const currentMap = await getFeedbackForTargets(
      req.userId,
      String(targetType),
      [String(targetId)]
    );
    const current = Number(currentMap[String(targetId)] || 0);
    const finalVote = current === voteNum ? 0 : voteNum;

    await upsertFeedbackVote(
      req.userId,
      String(targetType),
      String(targetId),
      finalVote
    );

    return res.status(200).json({ success: true, vote: finalVote });
  } catch (err) {
    console.error("[feedback] error:", err);
    return res.status(500).json({ error: "Failed to save feedback" });
  }
}

module.exports = {
  queryFeedback,
  setFeedback,
  clearFeedbackHandler,
  // legacy
  saveFeedback,
};