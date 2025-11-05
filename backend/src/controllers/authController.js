// controllers/authController.js

const { signToken } = require("../utils/auth"); // create JWT from { id, email }
const { getUserByEmail, createUser } = require("../models/user"); // user DB helpers
const { hashPassword, verifyPassword } = require("../utils/password"); // password helpers

// POST /api/auth/login
async function login(req, res) {
  const { email, password } = req.body || {};
  const emailNorm = (email || "").trim().toLowerCase(); // normalize input

  // basic validation
  if (!emailNorm || !password) {
    return res.status(400).json({ error: "Missing email or password" });
  }

  try {
    // find user
    const user = await getUserByEmail(emailNorm);
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    // check password
    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    // sign token with minimal payload
    const token = signToken({ id: user.id, email: user.email });

    // success
    return res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email },
    });
  } catch (err) {
    console.error("[login] error:", err);
    return res.status(500).json({ error: "Server error during login" });
  }
}

// POST /api/auth/register
async function register(req, res) {
  const { name, email, password } = req.body || {};
  const emailNorm = (email || "").trim().toLowerCase();
  const nameNorm = (name || "").trim();

  // basic validation
  if (!emailNorm || !password) {
    return res.status(400).json({ error: "Missing email or password" });
  }

  try {
    // block duplicate emails
    const existing = await getUserByEmail(emailNorm);
    if (existing) return res.status(409).json({ error: "Email already in use" });

    // hash and create user
    const password_hash = await hashPassword(password);
    const user = await createUser({ name: nameNorm, email: emailNorm, password_hash });

    // sign token for the new user
    const token = signToken({ id: user.id, email: user.email });

    // success (flag for onboarding kept as-is)
    return res.status(201).json({
      token,
      user: { id: user.id, name: user.name, email: user.email },
      needsOnboarding: true,
    });
  } catch (err) {
    console.error("[register] error:", err);
    return res.status(500).json({ error: "Server error during registration" });
  }
}

module.exports = { login, register };