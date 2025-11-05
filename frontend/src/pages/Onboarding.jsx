// src/pages/Onboarding.jsx

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

// Simple option lists shown as "pills"
const ASSETS = ["bitcoin", "ethereum", "solana", "cardano", "ripple", "dogecoin"];
const INVESTOR_TYPES = ["HODLer", "Day Trader", "NFT Collector", "DeFi Farmer"];
const CONTENT = [
  { id: "market_news", label: "Market News" },
  { id: "charts", label: "Charts" },
  { id: "social", label: "Social" },
  { id: "fun", label: "Fun" },
];

export default function Onboarding({ token, onDone }) {
  const navigate = useNavigate();

  // Form state (what the user picks)
  const [assets, setAssets] = useState([]);
  const [investorType, setInvestorType] = useState("");
  const [contentTypes, setContentTypes] = useState([]);

  // UI state
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Load any existing preferences to prefill the form
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const res = await fetch("/api/onboarding", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (!alive) return;

        if (res.ok && data) {
          setAssets(data.assets || []);
          setInvestorType(data.investorType || "");
          setContentTypes(data.contentTypes || []);
        }
      } catch {
        // ignore: we can still let the user fill fresh values
      }
    })();

    return () => {
      // prevents setState after unmount
      alive = false;
    };
  }, [token]);

  // Toggle helpers for pill selections
  function toggleAssets(a) {
    setAssets((prev) =>
      prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]
    );
  }
  function toggleContent(c) {
    setContentTypes((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
    );
  }

  // Persist choices → backend; then navigate to dashboard
  async function handleSave() {
    if (saving) return; // avoid double-clicks
    setError("");
    setSaving(true);

    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ assets, investorType, contentTypes }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "Failed to save preferences. Please try again.");
        return;
      }

      // Let parent know onboarding has completed (if it gates UI)
      onDone?.({ completed: true, assets, investorType, contentTypes });

      // Route home (adjust to your dashboard path if needed)
      navigate("/");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: "16px auto 24px" }}>
      <p className="section-title-sm">Onboarding</p>
      <h1 style={{ fontSize: 26, marginBottom: 4 }}>
        Let&apos;s tailor your crypto feed ✨
      </h1>
      <p style={{ color: "var(--muted)", marginBottom: 12 }}>
        Pick what you like. You can change it later.
      </p>

      {error && (
        <div className="error-text" style={{ marginBottom: 12 }}>
          {error}
        </div>
      )}

      <div className="onboarding erosion-fix">
        <div className="onboarding-grid">
          {/* Assets */}
          <div>
            <h3 style={{ marginBottom: 10 }}>1. What crypto assets are you interested in?</h3>
            <div className="pill-group">
              {ASSETS.map((a) => {
                const active = assets.includes(a);
                return (
                  <button
                    key={a}
                    type="button"
                    onClick={() => toggleAssets(a)}
                    className={`pill ${active ? "active" : ""}`}
                    aria-pressed={active} // accessibility hint; no logic change
                  >
                    {a.toUpperCase()}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Investor type */}
          <div>
            <h3 style={{ marginBottom: 10 }}>2. What type of investor are you?</h3>
            <div className="pill-group">
              {INVESTOR_TYPES.map((it) => {
                const active = investorType === it;
                return (
                  <button
                    key={it}
                    type="button"
                    onClick={() => setInvestorType(it)}
                    className={`pill ${active ? "active" : ""}`}
                    aria-pressed={active}
                  >
                    {it}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Content types */}
          <div>
            <h3 style={{ marginBottom: 10 }}>3. What kind of content would you like to see?</h3>
            <div className="pill-group">
              {CONTENT.map((ct) => {
                const active = contentTypes.includes(ct.id);
                return (
                  <button
                    key={ct.id}
                    type="button"
                    onClick={() => toggleContent(ct.id)}
                    className={`pill ${active ? "active" : ""}`}
                    aria-pressed={active}
                  >
                    {ct.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Save action */}
        <button
          onClick={handleSave}
          className="btn"
          style={{ marginTop: 22, minWidth: 220 }}
          disabled={saving}
        >
          {saving ? "Saving…" : "Save & go to dashboard"}
        </button>
      </div>
    </div>
  );
}