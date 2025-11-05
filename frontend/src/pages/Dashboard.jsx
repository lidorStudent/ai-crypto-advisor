// src/pages/Dashboard.jsx

import React, {
  useEffect,
  useMemo,
  useState,
  useCallback,
  useRef,
} from "react";

/* ──────────────────────────
   Tab + label mapping
   ────────────────────────── */
const TABS = ["market", "prices", "ai", "meme"];

const CONTENT_TO_TAB = {
  market_news: "market",
  charts: "prices",
  social: "ai",
  fun: "meme",
};

const TAB_LABEL = {
  market: "Market News",
  prices: "Coin Prices",
  ai: "AI Insight",
  meme: "Fun Meme",
};

/* ──────────────────────────
   Coin helpers
   ────────────────────────── */
const COIN_ORDER = [
  "bitcoin",
  "ethereum",
  "solana",
  "cardano",
  "ripple",
  "dogecoin",
];

const SYMBOL_TO_ID = {
  btc: "bitcoin",
  eth: "ethereum",
  sol: "solana",
  ada: "cardano",
  xrp: "ripple",
  doge: "dogecoin",
};

/* ──────────────────────────
   Small UI bits
   ────────────────────────── */
function LoadingScreen({ title = "Loading dashboard…" }) {
  return (
    <div
      className="loading-screen"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="spinner" />
      <div className="subtitle">{title}</div>
    </div>
  );
}

function possessiveName(name) {
  if (!name) return "Your";
  const first = String(name).trim().split(/\s+/)[0];
  return /s$/i.test(first) ? `${first}’` : `${first}’s`;
}

function normalizeId(s) {
  const k = String(s || "").toLowerCase().trim();
  return SYMBOL_TO_ID[k] || k;
}

/* ──────────────────────────
   Safe defaults for first render
   ────────────────────────── */
const SAFE_DEFAULT = {
  preferences: null,
  sections: {
    news: [],
    prices: {},
    aiInsight: { id: "ai-static", text: "Stay nimble today." },
    meme: null,
  },
};

export default function Dashboard({
  token,
  user,
  onRequireOnboarding,
  onLogout,
}) {
  // Core data + page state
  const [data, setData] = useState(SAFE_DEFAULT);
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("market");

  // Live prices (polled)
  const [livePrices, setLivePrices] = useState(null);

  // Meme state
  const [currentMeme, setCurrentMeme] = useState(null);
  const [memeLoading, setMemeLoading] = useState(false);

  // News state (cached + manual refresh)
  const [newsItems, setNewsItems] = useState([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsError, setNewsError] = useState(null);
  const [newsUpdatedAt, setNewsUpdatedAt] = useState(null);
  const hasLoadedCachedNewsRef = useRef(false);

  // Votes map per content type
  const [votes, setVotes] = useState({
    news: {},
    price: {},
    ai_insight: {},
    meme: {},
  });

  // Timezone + friendly date
  const tz = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    []
  );

  const todayStr = useMemo(() => {
    return new Intl.DateTimeFormat("en-GB", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: tz,
    }).format(new Date());
  }, [tz]);

  // Try to show the user's first name nicely
  const displayName = useMemo(() => {
    if (user?.name) return user.name;
    try {
      const raw = localStorage.getItem("auth");
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed?.user?.name || null;
    } catch {
      return null;
    }
  }, [user]);

  // Last updated clock for news
  const newsUpdatedStr = useMemo(() => {
    if (!newsUpdatedAt) return null;
    return new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZone: tz,
    }).format(newsUpdatedAt);
  }, [newsUpdatedAt, tz]);

  /* ──────────────────────────
     Dashboard bootstrap (no fresh news here)
     ────────────────────────── */
  async function loadDashboard() {
    setError(null);
    setUnauthorized(false);
    setLoading(true);

    try {
      if (!token) {
        setUnauthorized(true);
        setData(SAFE_DEFAULT);
        return;
      }

      const res = await fetch("/api/dashboard", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });

      if (res.status === 401) {
        setUnauthorized(true);
        setData(SAFE_DEFAULT);
        return;
      }
      if (!res.ok) throw new Error(`/api/dashboard ${res.status}`);

      let d;
      try {
        d = await res.json();
      } catch {
        d = {};
      }

      d = d || {};
      d.sections = d.sections || {};
      d.sections.news = Array.isArray(d.sections.news) ? d.sections.news : [];
      d.sections.prices = d.sections.prices || {};
      d.sections.aiInsight =
        d.sections.aiInsight || { id: "ai-static", text: "Stay nimble today." };

      setData(d);

      // If user never did onboarding, nudge them there
      if (d.preferences === null) {
        onRequireOnboarding?.();
      }
    } catch (e) {
      console.error("loadDashboard failed:", e);
      setError(e?.message || "Unknown error");
      setData(SAFE_DEFAULT);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  /* ──────────────────────────
     News: one-time cached load
     ────────────────────────── */
  const fetchCachedNews = useCallback(async () => {
    if (!token) return;
    setNewsError(null);
    try {
      const res = await fetch("/api/dashboard/news", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const json = await res.json();
      const items = Array.isArray(json?.items) ? json.items : [];
      if (items.length) {
        setNewsItems(items);
        setNewsUpdatedAt(
          typeof json.updatedAt === "number" ? json.updatedAt : null
        );
      } else if (!newsItems.length && Array.isArray(data.sections?.news)) {
        setNewsItems(data.sections.news);
      }
    } catch (e) {
      setNewsError("Failed to load cached news.");
      if (!newsItems.length && Array.isArray(data.sections?.news)) {
        setNewsItems(data.sections.news);
      }
    }
  }, [token, data.sections, newsItems.length]);

  useEffect(() => {
    if (!hasLoadedCachedNewsRef.current && token) {
      hasLoadedCachedNewsRef.current = true;
      fetchCachedNews();
    }
  }, [token, fetchCachedNews]);

  /* ──────────────────────────
     News: manual refresh (token spend)
     ────────────────────────── */
  const refreshNews = useCallback(async () => {
    if (!token) return;
    setNewsLoading(true);
    setNewsError(null);
    try {
      const res = await fetch("/api/dashboard/news/refresh", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const json = await res.json();
      const items = Array.isArray(json?.items) ? json.items : [];
      setNewsItems(items);
      setNewsUpdatedAt(
        typeof json.updatedAt === "number" ? json.updatedAt : null
      );
    } catch (e) {
      setNewsError("Failed to refresh news.");
    } finally {
      setNewsLoading(false);
    }
  }, [token]);

  /* ──────────────────────────
     Allowed tabs from user prefs
     ────────────────────────── */
  const allowedTabs = useMemo(() => {
    const selected = data?.preferences?.contentTypes || [];
    const set = new Set(selected.map((ct) => CONTENT_TO_TAB[ct]).filter(Boolean));
    return set.size ? TABS.filter((t) => set.has(t)) : TABS.slice();
  }, [data]);

  // Make sure active tab is valid if prefs change
  useEffect(() => {
    if (!allowedTabs.length) return;
    if (!allowedTabs.includes(activeTab)) setActiveTab(allowedTabs[0]);
  }, [allowedTabs, activeTab]);

  /* ──────────────────────────
     Prices: live polling while on tab
     ────────────────────────── */
  const PRICE_POLL_MS = 3000;

  useEffect(() => {
    if (activeTab !== "prices") return;

    let timer;
    let abort;

    async function fetchLive() {
      abort?.abort();
      abort = new AbortController();

      try {
        const res = await fetch("/api/dashboard/prices", {
          headers: { Authorization: `Bearer ${token}` },
          signal: abort.signal,
          cache: "no-store",
        });
        const json = await res.json();
        setLivePrices(json || {});
      } catch {
        /* ignore */
      }
    }

    fetchLive();
    timer = setInterval(fetchLive, PRICE_POLL_MS);

    const onFocus = () => fetchLive();
    const onVisibility = () => {
      if (document.visibilityState === "visible") fetchLive();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      abort?.abort();
    };
  }, [activeTab, token]);

  /* ──────────────────────────
     Meme: fetch on first visit
     ────────────────────────── */
  const refreshMeme = useCallback(async () => {
    try {
      setMemeLoading(true);
      const res = await fetch("/api/dashboard/meme", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const m = await res.json();
      setCurrentMeme(m);
    } catch {
      /* ignore */
    } finally {
      setMemeLoading(false);
    }
  }, [token]);

  const hasFetchedMemeRef = useRef(false);
  useEffect(() => {
    if (activeTab === "meme" && !hasFetchedMemeRef.current) {
      hasFetchedMemeRef.current = true;
      refreshMeme();
    }
  }, [activeTab, refreshMeme]);

  /* ──────────────────────────
     Votes: persist + pressed UI
     ────────────────────────── */
  const mergeVotes = useCallback((type, map) => {
    setVotes((prev) => ({
      ...prev,
      [type]: { ...(prev[type] || {}), ...(map || {}) },
    }));
  }, []);

  const getVote = useCallback(
    (type, id) => {
      return (votes[type] && votes[type][id]) || 0;
    },
    [votes]
  );

  // Ask backend which items are liked/disliked (for pressed state)
  const prefetchVotes = useCallback(
    async (type, ids) => {
      if (!token || !Array.isArray(ids) || ids.length === 0) return;
      const qs =
        "/api/feedback/query?type=" +
        encodeURIComponent(type) +
        "&ids=" +
        ids.map(encodeURIComponent).join(",");
      try {
        const res = await fetch(qs, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        if (json && json.votes) {
          mergeVotes(type, json.votes);
        }
      } catch {
        /* ignore */
      }
    },
    [token, mergeVotes]
  );

  // Toggle press → XOR logic lives on the backend
  const toggleVote = useCallback(
    async (type, id, desired) => {
      if (!token || !id) return;
      try {
        const res = await fetch("/api/feedback/set", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            targetType: type,
            targetId: String(id),
            vote: Number(desired),
          }),
        });
        const json = await res.json();
        const finalVote = Number(json?.vote ?? 0);
        mergeVotes(type, { [String(id)]: finalVote });
      } catch {
        /* ignore */
      }
    },
    [token, mergeVotes]
  );

  // Prefetch AI vote (id is stable for the day)
  useEffect(() => {
    const aiId = data?.sections?.aiInsight?.id;
    if (aiId) prefetchVotes("ai_insight", [aiId]);
  }, [data?.sections?.aiInsight?.id, prefetchVotes]);

  // Prefetch news votes when list changes
  const lastNewsPrefetched = useRef("");
  useEffect(() => {
    if (!Array.isArray(newsItems) || newsItems.length === 0) return;
    const ids = newsItems.map((n) => String(n.id || n.url));
    const key = ids.join("|");
    if (key !== lastNewsPrefetched.current) {
      lastNewsPrefetched.current = key;
      prefetchVotes("news", ids.slice(0, 200));
    }
  }, [newsItems, prefetchVotes]);

  // Prefetch price votes when we have any price keys
  useEffect(() => {
    const priceObj =
      (activeTab === "prices" && (livePrices || data?.sections?.prices)) ||
      data?.sections?.prices ||
      {};
    const ids = Object.keys(priceObj || {});
    if (ids.length) prefetchVotes("price", ids.slice(0, 200));
  }, [activeTab, livePrices, data?.sections?.prices, prefetchVotes]);

  // Prefetch meme vote when meme changes
  useEffect(() => {
    const id = currentMeme?.id;
    if (id) prefetchVotes("meme", [String(id)]);
  }, [currentMeme?.id, prefetchVotes]);

  /* ──────────────────────────
     Early returns after hooks
     ────────────────────────── */
  if (loading) return <LoadingScreen title="Warming up your crypto feed…" />;

  if (unauthorized) {
    return (
      <div className="loading-screen">
        <div className="subtitle" style={{ fontSize: 18, marginBottom: 10 }}>
          You're not signed in. Please log in again to view your dashboard.
        </div>
        <button
          className="btn"
          onClick={() => onLogout?.()}
          style={{ padding: "8px 14px" }}
        >
          Log in
        </button>
      </div>
    );
  }

  if (error) {
    return (
      <div className="loading-screen">
        <div className="subtitle" style={{ fontSize: 16, marginBottom: 10 }}>
          Couldn't load dashboard: {String(error)}
        </div>
        <button
          className="btn"
          onClick={loadDashboard}
          style={{ padding: "8px 14px" }}
        >
          Retry
        </button>
      </div>
    );
  }

  /* ──────────────────────────
     Final render prep
     ────────────────────────── */
  const sections = data?.sections || {};
  const prices =
    activeTab === "prices" && livePrices ? livePrices : sections.prices || {};
  const aiInsight =
    sections.aiInsight || { id: "ai-static", text: "Stay nimble today." };

  const news = newsItems; // render this (cached or refreshed)

  // Normalize/keep price order
  const selectedAssets = (
    Array.isArray(data?.preferences?.assets) ? data.preferences.assets : []
  ).map(normalizeId);

  const orderedEntries = (() => {
    if (!prices || typeof prices !== "object") return [];
    if (selectedAssets.length > 0) {
      const primary = COIN_ORDER.filter(
        (id) => selectedAssets.includes(id) && prices[id]
      );
      const extras = selectedAssets.filter(
        (id) => !COIN_ORDER.includes(id) && prices[id]
      );
      return [...primary, ...extras].map((id) => [id, prices[id]]);
    }
    const inOrder = COIN_ORDER.filter((id) => prices[id]);
    const remaining = Object.keys(prices)
      .filter((k) => !COIN_ORDER.includes(k))
      .sort((a, b) => a.localeCompare(b));
    return [...inOrder, ...remaining].map((id) => [id, prices[id]]);
  })();

  const isAllowed = (tabKey) => allowedTabs.includes(tabKey);

  // Legacy helper kept for compatibility (just calls the new toggle)
  async function sendFeedback(targetType, targetId, vote) {
    await toggleVote(targetType, targetId, vote);
  }

  /* ──────────────────────────
     Render
     ────────────────────────── */
  return (
    <>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 10,
          alignItems: "center",
        }}
      >
        <div>
          <p className="section-title-sm">Today • {todayStr}</p>
          <h1 style={{ fontSize: 26, marginBottom: 0 }}>
            {possessiveName(displayName)} AI crypto HQ 🚀
          </h1>
          <p style={{ color: "var(--muted)" }}>
            Switch between tabs to learn more.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: 8,
          marginTop: 18,
          marginBottom: 14,
          background: "rgba(15,23,42,0.25)",
          border: "1px solid rgba(148,163,184,0.15)",
          borderRadius: 999,
          padding: 4,
          width: "fit-content",
        }}
      >
        {isAllowed("market") && (
          <button
            onClick={() => setActiveTab("market")}
            className={activeTab === "market" ? "btn" : "btn-ghost"}
            style={{ borderRadius: 999, fontSize: 13, padding: "6px 14px" }}
          >
            {TAB_LABEL.market}
          </button>
        )}
        {isAllowed("prices") && (
          <button
            onClick={() => setActiveTab("prices")}
            className={activeTab === "prices" ? "btn" : "btn-ghost"}
            style={{ borderRadius: 999, fontSize: 13, padding: "6px 14px" }}
          >
            {TAB_LABEL.prices}
          </button>
        )}
        {isAllowed("ai") && (
          <button
            onClick={() => setActiveTab("ai")}
            className={activeTab === "ai" ? "btn" : "btn-ghost"}
            style={{ borderRadius: 999, fontSize: 13, padding: "6px 14px" }}
          >
            {TAB_LABEL.ai}
          </button>
        )}
        {isAllowed("meme") && (
          <button
            onClick={() => setActiveTab("meme")}
            className={activeTab === "meme" ? "btn" : "btn-ghost"}
            style={{ borderRadius: 999, fontSize: 13, padding: "6px 14px" }}
          >
            {TAB_LABEL.meme}
          </button>
        )}
      </div>

      {/* MARKET */}
      {activeTab === "market" && isAllowed("market") && (
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Market News 📰</div>
              <div className="card-sub">
                What's moving the market? Press "New News" for fresh headlines
              </div>
            </div>

            {/* Right: stats + refresh */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 12,
              }}
            >
              <span className="badge-green">{news.length} posts</span>
              {!!newsUpdatedStr && (
                <span className="badge" title="Last updated">
                  Updated: {newsUpdatedStr}
                </span>
              )}
              <button
                className="btn-ghost"
                onClick={refreshNews}
                disabled={newsLoading}
                title="Fetch fresh headlines"
              >
                {newsLoading ? "Loading…" : "New News"}
              </button>
            </div>
          </div>

          {newsError && (
            <div
              style={{
                color: "var(--muted)",
                fontSize: 12,
                marginBottom: 8,
              }}
            >
              {newsError}
            </div>
          )}

          <div className="list-news">
            {news.map((item) => {
              const id = String(item.id || item.url);
              const v = getVote("news", id);
              return (
                <div key={id} className="news-item">
                  <div>
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      className="news-title"
                    >
                      {item.title}
                    </a>
                    <div className="news-source">{item.source}</div>
                  </div>
                  <div className="vote-btns">
                    <button
                      onClick={() => toggleVote("news", id, 1)}
                      className={`vote-btn like ${v === 1 ? "pressed" : ""}`}
                      title="I like this"
                    >
                      👍
                    </button>
                    <button
                      onClick={() => toggleVote("news", id, -1)}
                      className={`vote-btn dislike ${v === -1 ? "pressed" : ""}`}
                      title="Not relevant"
                    >
                      👎
                    </button>
                  </div>
                </div>
              );
            })}
            {news.length === 0 && (
              <p style={{ color: "var(--muted)", fontSize: 12 }}>
                No news yet. Click <em>New News</em> to fetch headlines.
              </p>
            )}
          </div>
        </div>
      )}

      {/* PRICES */}
      {activeTab === "prices" && isAllowed("prices") && (
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Coin Prices 💰</div>
              <div className="card-sub">Live charts, from CoinGecko</div>
            </div>
          </div>
          <div className="price-list">
            {orderedEntries.length === 0 ? (
              <p style={{ color: "var(--muted)", fontSize: 12 }}>
                No price data available right now. Try switching tabs or wait a
                moment.
              </p>
            ) : (
              orderedEntries.map(([coin, info]) => {
                const change = Number(info.usd_24h_change || 0);
                const up = change >= 0;
                const priceNum = Number(info.usd);
                const priceText =
                  priceNum >= 1
                    ? priceNum.toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })
                    : priceNum.toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 6,
                      });

                const v = getVote("price", coin);

                return (
                  <div key={coin} className="price-row">
                    <div className="price-name">
                      <span style={{ fontSize: 16, textTransform: "uppercase" }}>
                        {coin}
                      </span>
                    </div>
                    <div className="price-center">
                      <div className="price-value">${priceText}</div>
                      <div
                        className={`price-change ${up ? "price-up" : "price-down"}`}
                      >
                        <span className="pc-arrow">{up ? "▲" : "▼"}</span>
                        <span className="pc-text">
                          {Math.abs(change).toFixed(2)}%
                        </span>
                      </div>
                    </div>
                    <div className="vote-btns">
                      <button
                        onClick={() => toggleVote("price", coin, 1)}
                        className={`vote-btn like ${v === 1 ? "pressed" : ""}`}
                        title="Like"
                      >
                        👍
                      </button>
                      <button
                        onClick={() => toggleVote("price", coin, -1)}
                        className={`vote-btn dislike ${v === -1 ? "pressed" : ""}`}
                        title="Dislike"
                      >
                        👎
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* AI */}
      {activeTab === "ai" && isAllowed("ai") && (
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">AI Insight of the Day 🤖</div>
              <div className="card-sub">Based on your profile</div>
            </div>
            <div className="vote-btns">
              {(() => {
                const id = aiInsight.id;
                const v = getVote("ai_insight", id);
                return (
                  <>
                    <button
                      onClick={() => toggleVote("ai_insight", id, 1)}
                      className={`vote-btn like ${v === 1 ? "pressed" : ""}`}
                      title="Like"
                    >
                      👍
                    </button>
                    <button
                      onClick={() => toggleVote("ai_insight", id, -1)}
                      className={`vote-btn dislike ${v === -1 ? "pressed" : ""}`}
                      title="Dislike"
                    >
                      👎
                    </button>
                  </>
                );
              })()}
            </div>
          </div>
          <div className="ai-box">{aiInsight.text}</div>
        </div>
      )}

      {/* MEME */}
      {activeTab === "meme" && isAllowed("meme") && (
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Fun Crypto Meme 😂</div>
              <div className="card-sub">
                Enjoy! Press "New Meme" to keep laughing
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div className="vote-btns">
                {(() => {
                  const id = currentMeme?.id ? String(currentMeme.id) : null;
                  const v = id ? getVote("meme", id) : 0;
                  return (
                    <>
                      <button
                        onClick={() => id && toggleVote("meme", id, 1)}
                        className={`vote-btn like ${v === 1 ? "pressed" : ""}`}
                        disabled={!id}
                        title="Like"
                      >
                        👍
                      </button>
                      <button
                        onClick={() => id && toggleVote("meme", id, -1)}
                        className={`vote-btn dislike ${v === -1 ? "pressed" : ""}`}
                        disabled={!id}
                        title="Dislike"
                      >
                        👎
                      </button>
                    </>
                  );
                })()}
              </div>
              <button
                className="btn-ghost"
                onClick={refreshMeme}
                disabled={memeLoading}
                title="Get a fresh meme"
              >
                {memeLoading ? "Loading…" : "New Meme"}
              </button>
            </div>
          </div>
          <div
            className="meme-box"
            style={{ maxWidth: 420, margin: "0 auto", textAlign: "center" }}
          >
            <strong>{currentMeme?.title || "Crypto vibes ✨"}</strong>
            {currentMeme?.img ? (
              <img
                src={currentMeme.img}
                alt={currentMeme.title || "crypto meme"}
                referrerPolicy="no-referrer"
                loading="lazy"
                style={{
                  marginTop: 10,
                  borderRadius: 10,
                  maxWidth: "100%",
                  height: "auto",
                  maxHeight: 320,
                  display: "block",
                  marginLeft: "auto",
                  marginRight: "auto",
                }}
              />
            ) : (
              <p style={{ color: "var(--muted)", fontSize: 11, marginTop: 6 }}>
                No image for this meme.
              </p>
            )}
            {currentMeme?.permalink && (
              <p style={{ fontSize: 12, marginTop: 6 }}>
                <a
                  href={currentMeme.permalink}
                  target="_blank"
                  rel="noreferrer"
                >
                  View on Reddit
                </a>
              </p>
            )}
            <p style={{ color: "var(--muted)", fontSize: 10, marginTop: 6 }}>
              Source: {currentMeme?.source || "static"}
            </p>
          </div>
        </div>
      )}
    </>
  );
}