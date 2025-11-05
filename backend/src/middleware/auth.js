// backend/src/middleware/auth.js

const { verifyToken } = require("../utils/auth");
const dotenv = require("dotenv");
dotenv.config();

/**
 * Express middleware to validate Bearer JWT.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || "";

  // Must be a Bearer token
  if (!authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing authorization token" });
  }

  const token = authHeader.slice(7); // strip "Bearer "
  try {
    // Verify and pull a user id from common fields
    const decoded = verifyToken(token);
    const userId = decoded?.sub ?? decoded?.userId ?? decoded?.id;

    if (!userId) {
      // Keep details in server logs, not in responses
      console.warn("[auth] Invalid token payload:", decoded);
      return res.status(401).json({ error: "Invalid token payload" });
    }

    // Attach minimal identity for downstream handlers
    req.userId = userId;
    req.user = { id: userId, email: decoded?.email || null };

    return next();
  } catch (err) {
    console.warn("[auth] JWT verify error:", err.message);
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

module.exports = authMiddleware;