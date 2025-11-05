// src/pages/Register.jsx

import React, { useMemo, useState } from "react";

export default function Register({ onAuth }) {
  // form fields
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // server feedback
  const [err, setErr] = useState("");
  const [issues, setIssues] = useState([]);

  // quick client-side password tips (just to guide; server still validates)
  const policy = useMemo(() => {
    const p = password || "";
    const nm = (name || "").toLowerCase();
    const em = (email || "").toLowerCase();
    const localEmail = em.split("@")[0] || "";

    const hasUpper = /[A-Z]/.test(p);
    const hasLower = /[a-z]/.test(p);
    const hasDigit = /\d/.test(p);
    const hasSymbol = /[^A-Za-z0-9]/.test(p);
    const longEnough = p.length >= 12;
    const noTripleRepeat = !/(.)\1\1/.test(p);

    // avoid obvious personal info (basic check)
    const tokens = [
      ...nm.split(/\s+/).filter((t) => t.length >= 3),
      ...(localEmail ? [localEmail] : []),
    ].filter(Boolean);
    const notNameOrEmail = !tokens.some(
      (t) => t && p.toLowerCase().includes(t)
    );

    const match = p && confirmPassword && p === confirmPassword;

    const score = [
      longEnough,
      hasUpper,
      hasLower,
      hasDigit,
      hasSymbol,
      noTripleRepeat,
      notNameOrEmail,
    ].filter(Boolean).length;

    return {
      longEnough,
      hasUpper,
      hasLower,
      hasDigit,
      hasSymbol,
      noTripleRepeat,
      notNameOrEmail,
      match,
      score,
      percent: Math.round((score / 7) * 100),
    };
  }, [password, confirmPassword, name, email]);

  // hit backend /register; surface any errors
  async function handleSubmit(e) {
    e.preventDefault();
    setErr("");
    setIssues([]);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, confirmPassword }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setErr(data.error || data.message || "Register failed");
        if (Array.isArray(data.issues)) setIssues(data.issues);
        return;
      }

      onAuth({ token: data.token, user: data.user, needsOnboarding: true });
    } catch {
      setErr("Server unavailable");
    }
  }

  return (
    <div className="auth-wrapper">
      <form className="auth-card" onSubmit={handleSubmit} noValidate>
        <div className="auth-title">Create your account 🚀</div>
        <div className="auth-sub">We’ll personalise the feed for you.</div>

        {/* server-side error (if any) */}
        {err && (
          <div className="error-text" role="alert" aria-live="polite">
            {err}
            {issues.length > 0 && (
              <ul style={{ marginTop: 6, paddingLeft: 18 }}>
                {issues.map((it, i) => (
                  <li key={i}>{it}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* basic fields */}
        <input
          className="input"
          placeholder="Full name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          required
        />
        <input
          className="input"
          placeholder="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          inputMode="email"
          required
        />
        <input
          className="input"
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          required
        />
        <input
          className="input"
          placeholder="Confirm password"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
          required
        />

        {/* local “strength” meter (just a visual hint) */}
        <div className="pw-meter" aria-hidden="true">
          <div
            className={`pw-meter-fill ${
              policy.percent >= 66
                ? "good"
                : policy.percent >= 33
                ? "ok"
                : "weak"
            }`}
            style={{ width: `${policy.percent}%` }}
          />
        </div>

        {/* small checklist to guide the user */}
        <div className="pw-checklist" aria-live="polite">
          <div className={`pw-rule ${policy.longEnough ? "pass" : "fail"}`}>
            {policy.longEnough ? "✓" : "•"} At least 12 characters
          </div>
          <div className={`pw-rule ${policy.hasUpper ? "pass" : "fail"}`}>
            {policy.hasUpper ? "✓" : "•"} Uppercase letter (A-Z)
          </div>
          <div className={`pw-rule ${policy.hasLower ? "pass" : "fail"}`}>
            {policy.hasLower ? "✓" : "•"} Lowercase letter (a-z)
          </div>
          <div className={`pw-rule ${policy.hasDigit ? "pass" : "fail"}`}>
            {policy.hasDigit ? "✓" : "•"} Number (0-9)
          </div>
          <div className={`pw-rule ${policy.hasSymbol ? "pass" : "fail"}`}>
            {policy.hasSymbol ? "✓" : "•"} Symbol (!@#$%^&*…)
          </div>
          <div className={`pw-rule ${policy.noTripleRepeat ? "pass" : "fail"}`}>
            {policy.noTripleRepeat ? "✓" : "•"} No 3+ repeated characters
          </div>
          <div className={`pw-rule ${policy.notNameOrEmail ? "pass" : "fail"}`}>
            {policy.notNameOrEmail ? "✓" : "•"} Doesn't contain your name/email
          </div>
          <div className={`pw-rule ${policy.match ? "pass" : "fail"}`}>
            {policy.match ? "✓" : "•"} Passwords match
          </div>
        </div>

        {/* gentle guard; backend still enforces real policy */}
        <button
          className="btn"
          style={{ width: "100%", marginTop: 8 }}
          disabled={!policy.match || policy.percent < 50}
        >
          Sign up
        </button>

        <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 12 }}>
          Already have an account? <a href="/login">Login</a>
        </p>
      </form>
    </div>
  );
}