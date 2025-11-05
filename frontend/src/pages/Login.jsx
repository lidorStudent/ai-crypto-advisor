// frontend/src/pages/Login.jsx

import React, { useState } from "react";

export default function Login({ onAuth }) {
  // controlled inputs + small UI state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");

  // Handle submit → POST to backend, store token via parent
  async function handleSubmit(e) {
    e.preventDefault();
    setErr("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      // If backend rejects, show a friendly message
      if (!res.ok) {
        setErr(data.message || "Login failed");
        return;
      }

      // Bubble success up to parent
      onAuth({ token: data.token, user: data.user });
    } catch (_error) {
      // Network/server unreachable
      setErr("Server unavailable");
    }
  }

  return (
    <div className="auth-wrapper">
      <form className="auth-card" onSubmit={handleSubmit}>
        {/* Title + subcopy */}
        <div className="auth-title">Welcome back 👋</div>
        <div className="auth-sub">Log in to your AI crypto HQ.</div>

        {/* Server-side error (if any) */}
        {err && <div className="error-text">{err}</div>}

        {/* Controlled inputs */}
        <input
          className="input"
          placeholder="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
        <input
          className="input"
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />

        {/* Submit */}
        <button className="btn" style={{ width: "100%", marginTop: 6 }}>
          Login
        </button>

        {/* Small helper link */}
        <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 12 }}>
          Don&apos;t have an account? <a href="/register">Register</a>
        </p>
      </form>
    </div>
  );
}