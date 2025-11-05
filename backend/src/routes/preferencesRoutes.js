// backend/src/routes/preferencesRoutes.js

const express = require("express");
const { getPreferences, setPreferences } = require("../controllers/preferencesController");
const auth = require("../middleware/auth");

const router = express.Router();

/* ---------------------------------------------
   GET /api/preferences
   Returns the authenticated user's saved prefs.
--------------------------------------------- */
router.get("/", auth, getPreferences);

/* ---------------------------------------------
   POST /api/preferences
   Create or update the authenticated user's prefs.
   Body: { assets: [], investorType: "", contentTypes: [] }
--------------------------------------------- */
router.post("/", auth, setPreferences);

module.exports = router;