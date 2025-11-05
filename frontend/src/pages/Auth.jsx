// frontend/src/pages/Auth.jsx

import React, { useMemo, useState } from "react";

// Simple, readable rules (keep in sync with backend policy if you change it)
const MIN_LENGTH = 12;
const symbolRegex = /[!@#$%^&*()_\-+=[\]{}|;:'",.<>/?~`]/;

/**
 * Derives a set of boolean checks for the live password rules list.
 * Kept inside a memo so we don't recompute on unrelated renders.
 */
function usePasswordChecks(password, name, email) {
  return useMemo(() => {
    const checks = {
      length: (password || "").length >= MIN_LENGTH,
      upper: /[A-Z]/.test(password || ""),
      lower: /[a-z]/.test(password || ""),
      digit: /\d/.test(password || ""),
      symbol: symbolRegex.test(password || ""),
      noSpaces: !/\s/.test(password || ""),
      noTripleRepeat: !/(.)\1\1/.test(password || ""),
      noSequential: !hasSequential(password || "", 4),
      noPersonal: !containsPersonalInfo(password || "", email, name),
    };
    return checks;
  }, [password, name, email]);
}

/**
 * Returns true if pw contains obvious personal info (name parts, email local).
 * Super light heuristic to nudge users away from weak choices.
 */
function containsPersonalInfo(pw, email = "", name = "") {
  const lc = (s) =>
    String(s || "")
      .toLowerCase()
      .trim();

  const parts = [];
  const n = lc(name);
  const e = lc(email);

  if (n) parts.push(...n.split(/\s+/).filter(Boolean));
  if (e) {
    const local = e.split("@")[0];
    if (local) parts.push(local);
  }

  return parts.some((part) => part.length >= 3 && lc(pw).includes(part));
}

/**
 * Detects easy ascending/descending sequences of length >= minLen.
 * Examples detected: "abcd", "4321", etc.
 */
function hasSequential(pw, minLen = 4) {
  if (!pw || pw.length < minLen) return false;
  const codes = Array.from(pw).map((c) => c.charCodeAt(0));
  let up = 1,
    down = 1;

  for (let i = 1; i < codes.length; i++) {
    if (codes[i] === codes[i - 1] + 1) {
      up++;
    } else {
      up = 1;
    }
    if (codes[i] === codes[i - 1] - 1) {
      down++;
    } else {
      down = 1;
    }
    if (up >= minLen || down >= minLen) return true;
  }
  return false;
}

export default function Auth({ onAuth }) {
  // UI mode
  const [mode, setMode] = useState("signup"); // "login" | "signup"

  // Form fields
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");

  // Server feedback
  const [serverError, setServerError] = useState("");
  const [serverPwErrors, setServerPwErrors] = useState([]);

  // UX
  const [loading, setLoading] = useState(false);

  // Live password checks
  const checks = usePasswordChecks(pw, name, email);

  // ───────────────────────────────────────────────────────────────────────────
  // Handlers
  // ───────────────────────────────────────────────────────────────────────────

  async function handleSignup(e) {
    e.preventDefault();
    setServerError("");
    setServerPwErrors([]);

    if (pw !== pw2) {
      setServerError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      // NOTE: if your backend route is /api/auth/register, change URL here
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          password: pw,
          confirmPassword: pw2,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        // Prefer backend-detailed messages when available
        if (data?.errors && Array.isArray(data.errors)) {
          setServerPwErrors(data.errors);
        } else if (data?.error) {
          setServerError(data.error);
        } else {
          setServerError("Signup failed.");
        }
        return;
      }

      onAuth(data.token, data.user);
    } catch (_err) {
      setServerError("Network error during signup.");
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin(e) {
    e.preventDefault();
    setServerError("");
    setServerPwErrors([]);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: pw }),
      });

      const data = await res.json();

      if (!res.ok) {
        setServerError(data?.error || "Login failed.");
        return;
      }

      onAuth(data.token, data.user);
    } catch (_err) {
      setServerError("Network error during login.");
    } finally {
      setLoading(false);
    }
  }

  // All client checks that must pass before enabling the signup button
  const allClientRulesPass =
    checks.length &&
    checks.upper &&
    checks.lower &&
    checks.digit &&
    checks.symbol &&
    checks.noSpaces &&
    checks.noTripleRepeat &&
    checks.noSequential &&
    checks.noPersonal;

  // ───────────────────────────────────────────────────────────────────────────
  // UI
  // ───────────────────────────────────────────────────────────────────────────

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        {/* Header + mode toggle */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <div className="auth-title">
            {mode === "signup" ? "Create account" : "Welcome back"}
          </div>
          <div>
            <button
              className="btn-ghost"
              onClick={() => setMode(mode === "signup" ? "login" : "signup")}
            >
              {mode === "signup"
                ? "Have an account? Log in"
                : "New here? Sign up"}
            </button>
          </div>
        </div>

        {/* Forms */}
        {mode === "signup" ? (
          <form onSubmit={handleSignup} noValidate>
            <input
              className="input"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <input
              className="input"
              placeholder="Your email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <input
              className="input"
              placeholder="Password"
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              required
            />
            <input
              className="input"
              placeholder="Confirm password"
              type="password"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              required
            />

            {/* Live checklist */}
            <ul className="rules-list">
              <Rule
                ok={checks.length}
                text={`At least ${MIN_LENGTH} characters`}
              />
              <Rule ok={checks.upper} text="At least one uppercase (A-Z)" />
              <Rule ok={checks.lower} text="At least one lowercase (a-z)" />
              <Rule ok={checks.digit} text="At least one digit (0-9)" />
              <Rule ok={checks.symbol} text="At least one symbol (!@#$…)" />
              <Rule ok={checks.noSpaces} text="No spaces" />
              <Rule
                ok={checks.noTripleRepeat}
                text="No 3+ identical characters in a row"
              />
              <Rule
                ok={checks.noSequential}
                text="No 4+ sequential characters (e.g. abcd, 4321)"
              />
              <Rule
                ok={checks.noPersonal}
                text="Doesn’t include your name/email"
              />
            </ul>

            {/* Server feedback (signup) */}
            {serverError && (
              <div className="error-text" style={{ marginTop: 6 }}>
                {serverError}
              </div>
            )}
            {serverPwErrors.length > 0 && (
              <div className="error-text" style={{ marginTop: 6 }}>
                {serverPwErrors.map((e, i) => (
                  <div key={i}>• {e}</div>
                ))}
              </div>
            )}

            <button
              className="btn"
              type="submit"
              disabled={!allClientRulesPass || pw !== pw2 || loading}
              style={{ width: "100%", marginTop: 10 }}
            >
              {loading ? "Creating…" : "Create account"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleLogin} noValidate>
            <input
              className="input"
              placeholder="Your email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              className="input"
              placeholder="Password"
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              required
            />

            {/* Server feedback (login) */}
            {serverError && (
              <div className="error-text" style={{ marginTop: 6 }}>
                {serverError}
              </div>
            )}

            <button
              className="btn"
              type="submit"
              disabled={loading}
              style={{ width: "100%", marginTop: 10 }}
            >
              {loading ? "Logging in…" : "Log in"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

/**
 * Small rule row for the live checklist.
 * OK state shows a checkmark; otherwise a neutral dot.
 */
function Rule({ ok, text }) {
  return (
    <li className={`rule ${ok ? "ok" : "bad"}`}>
      <span className="rule-bullet">{ok ? "✔" : "•"}</span>
      <span>{text}</span>
    </li>
  );
}