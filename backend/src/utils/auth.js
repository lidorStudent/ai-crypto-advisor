// backend/src/utils/auth.js

const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const dotenv = require("dotenv");

dotenv.config();

/* ===== JWT config ===== */
const DEFAULT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";
let JWT_SECRET = process.env.JWT_SECRET;

// Local dev fallback (don’t use in production)
if (!JWT_SECRET) {
  JWT_SECRET = "dev-insecure-secret-change-me-2ab00b3e1f9a4d6c9fa7b1c7e5a1c3d0";
  console.warn(
    "[auth] Warning: JWT_SECRET is not set. Using a dev fallback secret. " +
      "Set JWT_SECRET in your .env for production."
  );
}

// Defaults; overridable via env
const BASE_SIGN_OPTS = {
  expiresIn: DEFAULT_EXPIRES_IN,
  algorithm: "HS256",
  ...(process.env.JWT_ISSUER ? { issuer: process.env.JWT_ISSUER } : {}),
  ...(process.env.JWT_AUDIENCE ? { audience: process.env.JWT_AUDIENCE } : {}),
};

const BASE_VERIFY_OPTS = {
  algorithms: ["HS256"],
  ...(process.env.JWT_ISSUER ? { issuer: process.env.JWT_ISSUER } : {}),
  ...(process.env.JWT_AUDIENCE ? { audience: process.env.JWT_AUDIENCE } : {}),
};

/* ===== Token helpers ===== */

/**
 * Sign a JWT.
 * Preferred: signToken({ id, email? }, opts?)
 * Legacy: signToken(id, opts?) → logs a deprecation warning.
 */
function signToken(arg, opts = {}) {
  let id, email;

  if (arg && typeof arg === "object") {
    // modern shape
    id = arg.id ?? arg.sub;
    email = arg.email;
  } else {
    // legacy shape
    id = arg;
    console.warn(
      "[auth] DEPRECATION: signToken(id) called. Update to signToken({ id, email? })."
    );
  }

  if (!id) throw new Error("signToken requires an object with { id }");

  const payload = {
    sub: String(id),
    ...(email ? { email } : {}),
  };

  const signOpts = { ...BASE_SIGN_OPTS, ...(opts || {}) };
  return jwt.sign(payload, JWT_SECRET, signOpts);
}

/**
 * Verify a JWT (throws if invalid/expired).
 */
function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET, BASE_VERIFY_OPTS);
}

/**
 * Grab Bearer token from an Express request (or null).
 */
function extractBearer(req) {
  const auth = req.headers.authorization || "";
  return auth.startsWith("Bearer ") ? auth.slice(7) : null;
}

/* ===== Password helpers ===== */

async function hashPassword(plain) {
  const rounds = Number(process.env.BCRYPT_SALT_ROUNDS || 10);
  return bcrypt.hash(plain, rounds);
}

async function comparePassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

// Back-compat alias
const verifyPassword = comparePassword;

/* ===== Exports ===== */
module.exports = {
  signToken,
  verifyToken,
  extractBearer,
  hashPassword,
  comparePassword,
  verifyPassword, // alias
};