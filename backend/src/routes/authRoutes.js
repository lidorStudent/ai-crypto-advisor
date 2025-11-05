// backend/src/routes/authRoutes.js

const express = require("express");
const bcrypt = require("bcryptjs");
const { createUser, getUserByEmail } = require("../db");
const { validatePassword } = require("../utils/passwordPolicy");
const { signToken } = require("../utils/auth");

const router = express.Router();

/**
 * Tiny helper: normalize user id from different DB return shapes.
 * Accepts { id }, { user_id }, { insertId }, { lastID }, or a number.
 */
function normalizeUserId(saved) {
  if (!saved) return null;
  return (
    saved.id ??
    saved.user_id ??
    saved.insertId ??
    saved.lastID ??
    (typeof saved === "number" ? saved : null)
  );
}

/* -----------------------------------------------------------
   POST /api/auth/register
   Body: { name, email, password, [confirmPassword] }
   Returns: 201 { token, user, needsOnboarding: true } on success
   Notes: basic validation, unique email, password policy enforced
----------------------------------------------------------- */
router.post("/register", async (req, res) => {
  try {
    const { name, email, password, confirmPassword } = req.body || {};

    // 1) Basic validation
    if (!name || !email || !password) {
      return res.status(400).json({ message: "Missing required fields" });
    }
    if (confirmPassword != null && password !== confirmPassword) {
      return res.status(400).json({ message: "Passwords do not match" });
    }

    // 2) Email uniqueness
    const existing = await getUserByEmail(email);
    if (existing) {
      return res.status(400).json({ message: "Email is already registered" });
    }

    // 3) Password policy
    const { valid, errors } = validatePassword(password, { email, name });
    if (!valid) {
      return res.status(400).json({ message: "Weak password", errors });
    }

    // 4) Persist user with a strong hash
    const passwordHash = await bcrypt.hash(password, 10);
    const saved = await createUser({ name, email, passwordHash });

    // 5) Ensure we have a usable user id (covers various driver shapes)
    let userId = normalizeUserId(saved);

    // Some createUser impls return minimal info; re-read if needed
    let finalUser = null;
    if (!userId || !saved?.email || !saved?.name) {
      finalUser = await getUserByEmail(email);
      if (finalUser) {
        userId = finalUser.id ?? finalUser.user_id ?? userId;
      }
    } else {
      finalUser = saved;
    }

    if (!userId) {
      console.error("[register] createUser returned no id. Payload:", saved);
      return res
        .status(500)
        .json({ message: "Server error during registration" });
    }

    // 6) Issue JWT and respond
    const token = signToken({ id: userId, email });

    return res.status(201).json({
      token,
      user: {
        id: userId,
        name: finalUser?.name ?? name,
        email: finalUser?.email ?? email,
      },
      needsOnboarding: true,
    });
  } catch (e) {
    console.error("[register] error:", e);
    return res
      .status(500)
      .json({ message: "Server error during registration" });
  }
});

/* -----------------------------------------------------------
   POST /api/auth/login
   Body: { email, password }
   Returns: { token, user } on success
   Notes: generic error messages (don’t leak which field is wrong)
----------------------------------------------------------- */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ message: "Missing credentials" });
    }

    // Look up user by email (exact match as stored)
    const user = await getUserByEmail(email);
    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // Compare password against stored hash
    const hash = user.password_hash || user.passwordHash || "";
    const ok = await bcrypt.compare(password, hash);
    if (!ok) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // Mint token with minimal claims
    const token = signToken({ id: user.id, email: user.email });

    return res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email },
    });
  } catch (e) {
    console.error("[login] error:", e);
    return res.status(500).json({ message: "Server error during login" });
  }
});

module.exports = router;