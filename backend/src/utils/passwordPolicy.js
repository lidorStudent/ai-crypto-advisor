// backend/src/utils/passwordPolicy.js

const DEFAULT_RULES = {
  minLength: 12,
  maxLength: 128,
  minLower: 1,      // a–z
  minUpper: 1,      // A–Z
  minDigit: 1,      // 0–9
  minSymbol: 1,     // punctuation/symbols
  forbidCommon: true,
  forbidEmailParts: true,
  forbidNameParts: true,
};

// A tiny “too common” list to catch obvious choices.
// (You can grow this or plug in haveibeenpwned if you want later.)
const COMMON = new Set([
  "password",
  "123456",
  "123456789",
  "qwerty",
  "111111",
  "iloveyou",
  "admin",
  "welcome",
  "abc123",
  "letmein",
  "monkey",
  "dragon",
  "football",
]);

/**
 * Split a string into lowercase alphanumeric tokens.
 * Used to prevent reusing parts of email/name in the password.
 */
function tokenize(s = "") {
  return String(s)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * validatePassword
 * Simple, synchronous validator that returns { valid, errors }.
 *
 * @param {string} password  The candidate password.
 * @param {Object} ctx       Optional context: { email, name } to forbid reuse.
 * @param {Object} rules     Policy overrides; defaults to DEFAULT_RULES.
 *
 * Notes on checks:
 *  - Symbols class: /[!-/:-@[-`{-~]/ matches basic ASCII punctuation.
 *  - Email/name parts: we look for tokens of length ≥4 (email) and ≥3 (name).
 */
function validatePassword(
  password,
  { email = "", name = "" } = {},
  rules = DEFAULT_RULES
) {
  const p = String(password || "");
  const errors = [];

  // Length checks
  if (p.length < rules.minLength)
    errors.push(`Must be at least ${rules.minLength} characters.`);
  if (p.length > rules.maxLength)
    errors.push(`Must be at most ${rules.maxLength} characters.`);

  // Character class checks
  if ((p.match(/[a-z]/g) || []).length < rules.minLower)
    errors.push("Add a lowercase letter (a–z).");
  if ((p.match(/[A-Z]/g) || []).length < rules.minUpper)
    errors.push("Add an uppercase letter (A–Z).");
  if ((p.match(/[0-9]/g) || []).length < rules.minDigit)
    errors.push("Add a digit (0–9).");
  if ((p.match(/[!-/:-@[-`{-~]/g) || []).length < rules.minSymbol)
    errors.push("Add a symbol (e.g. !@#$%).");

  // Obvious/common passwords
  if (rules.forbidCommon && COMMON.has(p.toLowerCase())) {
    errors.push("Too common. Choose a more unique password.");
  }

  // Avoid reusing parts of the email (tokens ≥ 4 chars)
  if (rules.forbidEmailParts && email) {
    const parts = tokenize(email);
    for (const part of parts) {
      if (part.length >= 4 && p.toLowerCase().includes(part)) {
        errors.push("Avoid using your email in the password.");
        break;
      }
    }
  }

  // Avoid reusing parts of the name (tokens ≥ 3 chars)
  if (rules.forbidNameParts && name) {
    const parts = tokenize(name);
    for (const part of parts) {
      if (part.length >= 3 && p.toLowerCase().includes(part)) {
        errors.push("Avoid using your name in the password.");
        break;
      }
    }
  }

  const valid = errors.length === 0;
  return { valid, errors };
}

module.exports = { validatePassword, DEFAULT_RULES };