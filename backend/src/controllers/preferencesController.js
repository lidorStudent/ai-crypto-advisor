// controllers/preferencesController.js

const { getPreferencesByUser, upsertPreferences } = require("../db");

/**
 * GET /api/preferences
 * Return the current user's saved preferences.
 */
async function getPreferences(req, res) {
  try {
    const prefs = await getPreferencesByUser(req.userId);
    if (!prefs) {
      // No preferences yet → return null (client can decide what to show)
      return res.json(null);
    }

    // Stored as JSON strings in DB → convert back to JS values
    const parsed = {
      id: prefs.id,
      assets: prefs.assets ? JSON.parse(prefs.assets) : [],
      investorType: prefs.investor_type || "",
      contentTypes: prefs.content_types ? JSON.parse(prefs.content_types) : [],
    };

    return res.json(parsed);
  } catch (err) {
    console.error("[preferences:get] error:", err);
    return res.status(500).json({ error: "Failed to retrieve preferences" });
  }
}

/**
 * POST /api/preferences
 * Body: { assets: string[], investorType: string, contentTypes: string[] }
 * Create or update the current user's preferences.
 */
async function setPreferences(req, res) {
  const { assets, investorType, contentTypes } = req.body || {};

  try {
    await upsertPreferences(req.userId, {
      // Be forgiving: default to empty structures if missing
      assets: assets || [],
      investorType: investorType || "",
      contentTypes: contentTypes || [],
    });

    return res.json({ success: true });
  } catch (err) {
    console.error("[preferences:set] error:", err);
    return res.status(500).json({ error: "Failed to save preferences" });
  }
}

module.exports = {
  getPreferences,
  setPreferences,
};