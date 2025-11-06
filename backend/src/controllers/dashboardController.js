// backend/src/controllers/dashboardController.js

const { getPreferencesByUser } = require("../db");
const dotenv = require("dotenv");
dotenv.config();

/* ---------------------------------------
 * Fetch polyfill (for Node < 18)
 * ------------------------------------- */
let _fetch = (typeof globalThis !== "undefined" && globalThis.fetch) || null;
async function getFetch() {
  if (_fetch) return _fetch;
  const mod = await import("node-fetch"); // dynamic import keeps ESM happy
  _fetch = mod.default || mod;
  return _fetch;
}

/* ---------------------------------------
 * Static fallbacks (used on failures)
 * ------------------------------------- */
const FALLBACK_NEWS = [
  {
    id: "fallback-1",
    title: "Bitcoin steadies above key moving average",
    url: "https://example.com/bitcoin-steady",
    source: "Fallback",
  },
  {
    id: "fallback-2",
    title: "Ethereum developers hint at next major upgrade",
    url: "https://example.com/ethereum-upgrade",
    source: "Fallback",
  },
  {
    id: "fallback-3",
    title: "Solana ecosystem sees surge in NFT activity",
    url: "https://example.com/solana-nft",
    source: "Fallback",
  },
];

const STATIC_MEMES = [
  {
    id: "meme-2",
    title: "When BTC dumps 2% and CT panics",
    img: "https://images.unsplash.com/photo-1622630998477-20aa696ecb05?auto=format&fit=crop&w=900&q=60",
    source: "static-json",
  },
  {
    id: "meme-1",
    title: "Me refreshing prices every 5 seconds",
    img: "/memes/meme1.jpg",
    source: "static-json",
  },
];

/* =========================================================
 * NEWS (CryptoPanic) — shared fetcher + tiny in-memory cache
 * ======================================================= */
let NEWS_CACHE = new Map(); // key -> { ts, items }
const NEWS_TTL_MS = 60_000; // 1 min

function newsKey(q) {
  return JSON.stringify(q || {});
}

function buildNewsUrl({ page = 1, kind = "news", filter, regions, currencies }) {
  const token = process.env.CRYPTOPANIC_TOKEN || "";
  const base = "https://cryptopanic.com/api/developer/v2/posts/";
  const qs = new URLSearchParams({ kind, page: String(page) });
  if (filter) qs.set("filter", filter);
  if (regions) qs.set("regions", regions);
  if (currencies) qs.set("currencies", currencies);
  if (token) qs.set("auth_token", token);
  return `${base}?${qs.toString()}`;
}

async function fetchNews({
  page = 1,
  pages = 1,
  kind = "news",
  filter,
  regions = "en",
  currencies,
} = {}) {
  const key = newsKey({ page, pages, kind, filter, regions, currencies });
  const cached = NEWS_CACHE.get(key);
  const now = Date.now();
  if (cached && now - cached.ts < NEWS_TTL_MS) return cached.items;

  const out = [];
  const f = await getFetch();

  // fetch a few pages and flatten to a small list of items
  for (let p = page; p < page + pages; p++) {
    const url = buildNewsUrl({ page: p, kind, filter, regions, currencies });
    try {
      const res = await f(url, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`CryptoPanic ${res.status}`);
      const data = await res.json();
      const results = Array.isArray(data.results) ? data.results : [];
      const mapped = results.map((it) => ({
        id: String(it.id ?? it.url),
        title: it.title,
        url: it.url,
        source: it.source?.title || "CryptoPanic",
        published_at: it.published_at,
      }));
      out.push(...mapped);
      await new Promise((r) => setTimeout(r, 120)); // soft throttle
      if (!mapped.length) break; // stop if empty page
    } catch {
      break; // on error, bail and use what we have
    }
  }

  const items = out.length ? out : FALLBACK_NEWS;
  NEWS_CACHE.set(key, { ts: Date.now(), items });
  return items;
}

/* ----------------------------------------------------------------
 * Per-user sticky news (only changes when user hits "New News")
 * -------------------------------------------------------------- */
const NEWS_MAX_USERS = Number(process.env.NEWS_CACHE_MAX_USERS || 500);
const USER_NEWS = new Map(); // userId -> { items, updatedAt, lastRefreshAt }

function getUserNews(userId) {
  const row = USER_NEWS.get(String(userId));
  if (!row) return { items: FALLBACK_NEWS, updatedAt: 0, lastRefreshAt: 0 };
  return row;
}

function setUserNews(userId, items) {
  const id = String(userId);

  // naive LRU eviction by updatedAt
  if (!USER_NEWS.has(id) && USER_NEWS.size >= NEWS_MAX_USERS) {
    let oldestKey = null;
    let oldestTs = Infinity;
    for (const [k, v] of USER_NEWS.entries()) {
      if (v.updatedAt < oldestTs) {
        oldestTs = v.updatedAt;
        oldestKey = k;
      }
    }
    if (oldestKey) USER_NEWS.delete(oldestKey);
  }

  USER_NEWS.set(id, {
    items: Array.isArray(items) && items.length ? items : FALLBACK_NEWS,
    updatedAt: Date.now(),
    lastRefreshAt: Date.now(),
  });
}

const NEWS_REFRESH_MIN_INTERVAL_MS = Number(
  process.env.NEWS_REFRESH_MIN_INTERVAL_MS || 30_000
);

/* ---------------------------------------
 * News personalization helpers
 * ------------------------------------- */
const ID_TO_CP = {
  bitcoin: "btc",
  ethereum: "eth",
  solana: "sol",
  cardano: "ada",
  ripple: "xrp",
  dogecoin: "doge",
};

function toCpSymbols(assets = []) {
  const symbols = [];
  for (const id of assets) {
    const sym = ID_TO_CP[String(id || "").toLowerCase().trim()];
    if (sym) symbols.push(sym);
  }
  const MAX = 8; // CryptoPanic arg stays tidy
  return [...new Set(symbols)].slice(0, MAX).join(",");
}

function scoreByInvestorType(item, investorType) {
  const title = (item.title || "").toLowerCase();
  const domain = (item.source || "").toLowerCase();
  const published = new Date(item.published_at || Date.now()).getTime();
  const ageMinutes = Math.max(1, (Date.now() - published) / 60000);

  let score = Math.max(0, 200 - ageMinutes); // slight recency bias

  const LT_POS =
    /(upgrade|fork|partnership|adoption|etf|institution|regulat|roadmap|ecosystem|integration|on[- ]?chain)/i;
  const ST_POS =
    /(pump|dump|spike|rally|sell[- ]?off|liquidat|volatil|break(out|down)|funding|open interest|perp|futures|leverage|whales?)/i;
  const DEFI = /(defi|dex|amm|yield|staking|airdrop|liquidity|lend|borrow)/i;
  const RISKY = /(rug|exploit|hack|phish|scam|memecoin)/i;

  switch ((investorType || "").toLowerCase()) {
    case "trader":
    case "day_trader":
    case "short_term":
      score += ST_POS.test(title) ? 40 : 0;
      score += /binance|bybit|okx|kraken|coinbase/.test(domain) ? 15 : 0;
      break;
    case "long_term":
    case "investor":
      score += LT_POS.test(title) ? 50 : 0;
      score -= ST_POS.test(title) ? 10 : 0;
      break;
    case "defi":
    case "builder":
      score += DEFI.test(title) ? 40 : 0;
      break;
    case "conservative":
    case "risk_averse":
      score -= RISKY.test(title) ? 30 : 0;
      score += /(partnership|regulat|etf|upgrade)/i.test(title) ? 25 : 0;
      break;
    default:
      break;
  }

  return score;
}

function scoreByCoins(item, selectedSymbols) {
  if (!selectedSymbols || !selectedSymbols.length) return 0;
  const title = (item.title || "").toLowerCase();
  let s = 0;
  for (const sym of selectedSymbols) {
    if (new RegExp(`\\b${sym}\\b`, "i").test(title)) s += 10;
    if (new RegExp(`\\b${sym.toUpperCase()}\\b`).test(item.title || "")) s += 5;
  }
  return s;
}

function personalizeNews(items, prefs) {
  const investorType = prefs?.investorType || "";
  const cpSymbols = toCpSymbols(prefs?.assets || [])
    .split(",")
    .filter(Boolean);

  const scored = items.map((it) => {
    const sCoins = scoreByCoins(it, cpSymbols);
    const sType = scoreByInvestorType(it, investorType);
    return { item: it, score: sCoins + sType };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 60).map((x) => x.item);
}

/* ---------------------------------------
 * News routes (auth required)
 * ------------------------------------- */
// GET /api/dashboard/news
async function getNewsCachedHandler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const data = getUserNews(req.userId);
  return res.json({ items: data.items, updatedAt: data.updatedAt });
}

// POST /api/dashboard/news/refresh
async function refreshNewsHandler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const id = String(req.userId);
  const existing = getUserNews(id);
  const now = Date.now();
  const tooSoon = now - (existing.lastRefreshAt || 0) < NEWS_REFRESH_MIN_INTERVAL_MS;

  // basic rate limit per user
  if (tooSoon) {
    const retryAfter = NEWS_REFRESH_MIN_INTERVAL_MS - (now - (existing.lastRefreshAt || 0));
    return res.status(429).json({
      error: "Too soon",
      retryAfterMs: retryAfter,
      items: existing.items,
      updatedAt: existing.updatedAt,
    });
  }

  try {
    // personalize by current user prefs
    const prefsRow = await getPreferencesByUser(req.userId);
    const prefs = prefsRow
      ? {
          assets: prefsRow.assets ? JSON.parse(prefsRow.assets) : [],
          investorType: prefsRow.investor_type || "",
          contentTypes: prefsRow.content_types ? JSON.parse(prefsRow.content_types) : [],
        }
      : { assets: [], investorType: "" };

    // first try coin-scoped query; fallback to generic
    const currenciesArg = toCpSymbols(prefs.assets);
    let items = [];

    if (currenciesArg) {
      try {
        items = await fetchNews({
          page: 1,
          pages: 1,
          regions: "en",
          kind: "news",
          currencies: currenciesArg,
        });
      } catch {
        /* ignore and fallback */
      }
    }

    if (!Array.isArray(items) || items.length === 0) {
      items = await fetchNews({ page: 1, pages: 1, regions: "en", kind: "news" });
    }

    const personalized = personalizeNews(items, prefs);

    setUserNews(id, personalized);
    const data = getUserNews(id);
    return res.json({ items: data.items, updatedAt: data.updatedAt });
  } catch (e) {
    console.warn("[news/refresh] failed:", e.message);
    const data = getUserNews(id);
    return res.status(200).json({ items: data.items, updatedAt: data.updatedAt });
  }
}

/* =========================================
 * PRICES (CoinGecko) — short TTL + rate cap
 * ======================================= */
const PRICE_CACHE = new Map(); // key -> { ts, data }
const INFLIGHT = new Map();
const SCHEDULED = new Set();

const PRICE_CACHE_TTL_MS = Number(process.env.CG_TTL_MS || 2500); // ~2.5s
const RATE_PER_MIN = Number(process.env.CG_RATE_PER_MIN || 45);
const FALLBACK = {
  bitcoin: { usd: 64000, usd_24h_change: 1.2 },
  ethereum: { usd: 3200, usd_24h_change: -0.4 },
};

const CAPACITY = RATE_PER_MIN;
let tokens = CAPACITY;
let lastRefill = Date.now();
const refillPerMs = RATE_PER_MIN / 60000;

function tryConsumeToken() {
  const now = Date.now();
  const delta = now - lastRefill;
  if (delta > 0) {
    tokens = Math.min(CAPACITY, tokens + delta * refillPerMs);
    lastRefill = now;
  }
  if (tokens >= 1) {
    tokens -= 1;
    return true;
  }
  return false;
}

function msUntilNextToken() {
  if (tokens >= 1) return 0;
  const deficit = 1 - tokens;
  return Math.ceil(deficit / refillPerMs);
}

function priceKey(assets) {
  return (assets?.length ? assets : ["bitcoin", "ethereum"])
    .map((s) => String(s).toLowerCase().trim())
    .sort()
    .join(",");
}

async function fetchWithBackoff(url, options = {}, attempts = 3) {
  const f = await getFetch();
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    const res = await f(url, options);
    if (res.ok && res.status !== 429) return res.json();

    const retryAfter = parseFloat(res.headers.get("retry-after"));
    const delay = Number.isFinite(retryAfter)
      ? Math.max(400, retryAfter * 1000)
      : Math.min(1200 * 2 ** i, 5000) + Math.random() * 300;
    await new Promise((r) => setTimeout(r, delay));
    lastErr = new Error(`CoinGecko error: ${res.status}`);
  }
  throw lastErr || new Error("CoinGecko fetch failed");
}

async function doFetch(key) {
  const url =
    `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(key)}` +
    `&vs_currencies=usd&include_24hr_change=true`;

  const headers = { "User-Agent": "ai-crypto-advisor/1.0 (+yourdomain)" };
  if (process.env.COINGECKO_PRO_API_KEY) {
    headers["x-cg-pro-api-key"] = process.env.COINGECKO_PRO_API_KEY;
  } else if (process.env.COINGECKO_DEMO_API_KEY) {
    headers["x-cg-demo-api-key"] = process.env.COINGECKO_DEMO_API_KEY;
  }

  const json = await fetchWithBackoff(url, { headers }, 3);
  if (!json || !Object.keys(json).length) throw new Error("Empty price payload");

  PRICE_CACHE.set(key, { ts: Date.now(), data: json });
  return json;
}

function scheduleBackgroundRefresh(key) {
  if (SCHEDULED.has(key)) return;
  SCHEDULED.add(key);

  const delay = Math.max(200, msUntilNextToken());
  setTimeout(async () => {
    SCHEDULED.delete(key);
    if (INFLIGHT.has(key)) return;
    if (!tryConsumeToken()) return scheduleBackgroundRefresh(key);

    const p = (async () => {
      try {
        return await doFetch(key);
      } finally {
        INFLIGHT.delete(key);
      }
    })();

    INFLIGHT.set(key, p);
    try {
      await p;
    } catch {
      /* keep stale cache */
    }
  }, delay);
}

async function fetchPrices(assets) {
  const key = priceKey(assets);
  const now = Date.now();

  const cached = PRICE_CACHE.get(key);
  if (cached && now - cached.ts < PRICE_CACHE_TTL_MS) return cached.data;

  if (INFLIGHT.has(key)) return INFLIGHT.get(key);

  if (tryConsumeToken()) {
    const p = (async () => {
      try {
        return await doFetch(key);
      } catch (err) {
        console.warn("Price fetch failed, serving cache/fallback:", err.message);
        if (PRICE_CACHE.has(key)) return PRICE_CACHE.get(key).data;
        return FALLBACK;
      } finally {
        INFLIGHT.delete(key);
      }
    })();
    INFLIGHT.set(key, p);
    return p;
  }

  // rate-limited: schedule a background refresh and serve last known
  scheduleBackgroundRefresh(key);
  if (cached) return cached.data;
  return FALLBACK;
}

/* ===================================================
 * AI INSIGHT — per user, “daily” window with cutoff
 * ================================================= */
const APP_TZ = (process.env.APP_TZ || "Asia/Jerusalem").trim();
const AI_INSIGHT_CUTOFF_HOUR = Number(process.env.AI_INSIGHT_CUTOFF_HOUR || 7);

const LOCAL_AI_FALLBACKS = [
  "BTC holding above support — watch funding before adding size.",
  "ETH/BTC shows relative strength — consider gradual rotation.",
  "SOL volume rising — wait for confirmed breakout before entering.",
  "Volatility elevated — keep positions small today.",
];

function formatDayKey(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getHourInTz(date) {
  const hh = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TZ,
    hour: "2-digit",
    hour12: false,
  }).format(date);
  return Number(hh);
}

function currentPeriodKey() {
  const now = new Date();
  const hour = getHourInTz(now);
  if (hour < AI_INSIGHT_CUTOFF_HOUR) {
    const y = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    return formatDayKey(y);
  }
  return formatDayKey(now);
}

// Per-user cache + coalescing
const AI_MAX_USERS = Number(process.env.AI_CACHE_MAX_USERS || 1000);
const USER_AI_CACHE = new Map(); // userId -> { key, item, ts }
const AI_INFLIGHT_PER_USER = new Map(); // userId -> Promise

function setUserAi(userId, rec) {
  const id = String(userId);
  if (!USER_AI_CACHE.has(id) && USER_AI_CACHE.size >= AI_MAX_USERS) {
    // LRU by ts
    let oldestKey = null;
    let oldestTs = Infinity;
    for (const [k, v] of USER_AI_CACHE.entries()) {
      if (v.ts < oldestTs) {
        oldestTs = v.ts;
        oldestKey = k;
      }
    }
    if (oldestKey) USER_AI_CACHE.delete(oldestKey);
  }
  USER_AI_CACHE.set(id, rec);
}

async function getDailyAiInsight(userId, userInfo, prefs) {
  const key = currentPeriodKey();
  const id = String(userId);

  // serve cached for this “day key”
  const existing = USER_AI_CACHE.get(id);
  if (existing && existing.key === key && existing.item) return existing.item;

  // de-dup concurrent calls per user
  if (AI_INFLIGHT_PER_USER.has(id)) return AI_INFLIGHT_PER_USER.get(id);

  const p = (async () => {
    try {
      const item = await fetchAiInsight(userInfo, prefs);
      const rec = { key, item, ts: Date.now() };
      setUserAi(id, rec);
      return item;
    } catch (e) {
      console.warn("[AI Insight] generation failed:", e.message);
      // best effort fallback
      const last = USER_AI_CACHE.get(id);
      if (last && last.key === key && last.item) return last.item;
      const i = Math.floor(Math.random() * LOCAL_AI_FALLBACKS.length);
      const fallback = { id: "ai-static", text: LOCAL_AI_FALLBACKS[i] };
      setUserAi(id, { key, item: fallback, ts: Date.now() });
      return fallback;
    } finally {
      AI_INFLIGHT_PER_USER.delete(id);
    }
  })();

  AI_INFLIGHT_PER_USER.set(id, p);
  return p;
}

async function fetchAiInsight(userInfo, prefs) {
  const apiUrl = (process.env.AI_API_URL || "").trim();
  const token = (process.env.AI_API_TOKEN || "").trim();

  // local canned messages if no API configured
  if (!apiUrl || !token) {
    const i = Math.floor(Math.random() * LOCAL_AI_FALLBACKS.length);
    return { id: "ai-static", text: LOCAL_AI_FALLBACKS[i] };
  }

  const preferredModels = [
    (process.env.AI_MODEL || "").trim() || null,
    "google/gemma-2-2b-it",
    "microsoft/Phi-3-mini-4k-instruct",
    "HuggingFaceH4/zephyr-7b-beta",
  ].filter(Boolean);

  const userPrompt = [
    "You are an AI crypto advisor.",
    `User type: ${prefs?.investorType || "Unknown"}`,
    `Assets: ${prefs?.assets?.length ? prefs.assets.join(", ") : "bitcoin, ethereum"}`,
    "Give ONE actionable crypto insight for the next 24 hours.",
    "Max 80 words. No disclaimers.",
  ].join("\n");

  const f = await getFetch();
  for (const model of preferredModels) {
    try {
      const res = await f(apiUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: "You give short, concrete crypto insights." },
            { role: "user", content: userPrompt },
          ],
          max_tokens: 120,
          temperature: 0.7,
        }),
      });

      if (!res.ok) {
        const txt = await res.text();
        if ([400, 402, 404, 422].includes(res.status)) {
          console.warn(`AI model ${model} failed (${res.status}): ${txt}`);
          continue; // try next model
        }
        throw new Error(`AI service error: ${res.status} ${txt}`);
      }

      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content?.trim();
      if (text) return { id: `ai-${Date.now()}`, text };
      console.warn(`AI model ${model} returned empty text; trying next.`);
    } catch (err) {
      console.warn(`AI model ${model} error:`, err.message);
    }
  }

  // final local fallback
  const i = Math.floor(Math.random() * LOCAL_AI_FALLBACKS.length);
  return { id: "ai-static", text: LOCAL_AI_FALLBACKS[i] };
}

/* ===========================================
 * MEMES (Reddit) — now via OAuth (client creds)
 * ========================================= */

// ⬇️ NEW: Reddit app-only OAuth (token cached in-memory)
const REDDIT_CLIENT_ID = (process.env.REDDIT_CLIENT_ID || "").trim();
const REDDIT_CLIENT_SECRET = (process.env.REDDIT_CLIENT_SECRET || "").trim();

let REDDIT_TOKEN = null;
let REDDIT_TOKEN_EXP = 0; // epoch ms

async function getRedditAppToken() {
  const now = Date.now();
  if (REDDIT_TOKEN && now < REDDIT_TOKEN_EXP - 10_000) return REDDIT_TOKEN;

  if (!REDDIT_CLIENT_ID || !REDDIT_CLIENT_SECRET) {
    throw new Error("Missing REDDIT_CLIENT_ID/REDDIT_CLIENT_SECRET");
  }

  const f = await getFetch();
  const basic = Buffer.from(`${REDDIT_CLIENT_ID}:${REDDIT_CLIENT_SECRET}`).toString("base64");
  const resp = await f("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "ai-crypto-advisor/1.0 (by u/userless)",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope: "read",
    }),
  });

  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error(`Reddit token error: ${resp.status} ${t}`);
  }
  const json = await resp.json();
  REDDIT_TOKEN = json.access_token;
  const expiresSec = Number(json.expires_in || 3600);
  REDDIT_TOKEN_EXP = now + expiresSec * 1000;
  return REDDIT_TOKEN;
}

const MEME_SUBS = ["CryptoCurrencyMemes", "cryptomemes", "BitcoinMemes"];
const MEME_SORTS = [
  { sort: "top", t: "day" },
  { sort: "top", t: "week" },
  { sort: "top", t: "month" },
  { sort: "hot" },
  { sort: "new" },
];

let MEME_CACHE = [];
let MEME_CACHE_TS = 0;
const MEME_CACHE_TTL_MS = 2 * 60 * 1000; // 2 min

// global recent list (avoid back-to-back repeats)
const RECENT_IDS = new Set();
const RECENT_QUEUE = [];
const RECENT_MAX = 100;

function _recordRecent(id) {
  if (RECENT_IDS.has(id)) return;
  RECENT_IDS.add(id);
  RECENT_QUEUE.push(id);
  if (RECENT_QUEUE.length > RECENT_MAX) {
    const old = RECENT_QUEUE.shift();
    RECENT_IDS.delete(old);
  }
}

function _unescape(url) {
  return typeof url === "string" ? url.replace(/&amp;/g, "&") : url;
}

function _pickImageFromPost(d) {
  if (d.is_gallery && d.media_metadata) {
    const keys = Object.keys(d.media_metadata);
    if (keys.length) {
      const first = d.media_metadata[keys[0]];
      const src = first?.s?.u || first?.s?.gif || first?.s?.mp4;
      if (src) return _unescape(src);
    }
  }
  const preview = d.preview?.images?.[0]?.source?.url;
  if (preview) return _unescape(preview);
  const direct = d.url_overridden_by_dest || d.url;
  if (direct) return _unescape(direct);
  return null;
}

// ⬇️ UPDATED: use OAuth API + Bearer token
async function _fetchRedditListing(url, after = null) {
  const sep = url.includes("?") ? "&" : "?";
  const finalUrl = after ? `${url}${sep}after=${encodeURIComponent(after)}` : url;

  const token = await getRedditAppToken();
  const headers = {
    Authorization: `Bearer ${token}`,
    "User-Agent": "ai-crypto-advisor/1.0 (by u/userless)",
    Accept: "application/json",
  };
  const f = await getFetch();
  const res = await f(finalUrl, { headers });
  if (!res.ok) throw new Error(`Reddit ${finalUrl} -> ${res.status}`);
  return res.json();
}

// ⬇️ UPDATED: switch to oauth.reddit.com base
async function _fetchOneSource(sub, sort, t) {
  let url = `https://oauth.reddit.com/r/${sub}/${sort}.json?limit=100`;
  if (t) url += `&t=${t}`;

  const aggregated = [];
  let after = null;
  for (let page = 0; page < 2; page++) {
    const json = await _fetchRedditListing(url, after);
    const children = json?.data?.children || [];

    for (const c of children) {
      const d = c?.data || {};
      if (!d) continue;
      if (d.over_18) continue;
      const img = _pickImageFromPost(d);
      if (!img) continue;

      const id = String(d.id || d.name || d.permalink || Math.random());
      const title = d.title || "Crypto meme";
      const permalink = d.permalink ? `https://reddit.com${d.permalink}` : undefined;

      aggregated.push({ id, title, img, source: "reddit", permalink });
    }

    after = json?.data?.after || null;
    if (!after) break;
  }
  return aggregated;
}

async function fetchRedditMemesFeed() {
  const now = Date.now();
  if (MEME_CACHE.length && now - MEME_CACHE_TS < MEME_CACHE_TTL_MS) {
    return MEME_CACHE;
  }

  // build a shuffled list of sources (subs x sorts)
  let aggregated = [];
  const sources = [];
  for (const sub of MEME_SUBS) {
    for (const s of MEME_SORTS) {
      sources.push({ sub, sort: s.sort, t: s.t });
    }
  }
  for (let i = sources.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [sources[i], sources[j]] = [sources[j], sources[i]];
  }

  for (const src of sources) {
    try {
      const chunk = await _fetchOneSource(src.sub, src.sort, src.t);
      aggregated = aggregated.concat(chunk);
      if (aggregated.length > 600) break; // enough
    } catch (_) {}
  }

  // dedupe by (id, img)
  const seen = new Set();
  const seenImg = new Set();
  const deduped = [];
  for (const m of aggregated) {
    const k = `${m.id}::${m.img}`;
    if (seen.has(k) || seenImg.has(m.img)) continue;
    seen.add(k);
    seenImg.add(m.img);
    deduped.push(m);
  }

  if (!deduped.length) {
    MEME_CACHE = [...STATIC_MEMES];
    MEME_CACHE_TS = now;
    return MEME_CACHE;
  }

  MEME_CACHE = deduped;
  MEME_CACHE_TS = now;
  return MEME_CACHE;
}

async function getRandomMeme() {
  const feed = await fetchRedditMemesFeed();
  let pool = feed.filter((m) => !RECENT_IDS.has(m.id));
  if (!pool.length) pool = feed;
  const idx = Math.floor(Math.random() * pool.length);
  const meme = pool[idx];
  _recordRecent(meme.id);
  return meme;
}

/* ------------------------------------------------------
 * Personalized meme picker (per user, light scoring)
 * ---------------------------------------------------- */
const ID_TO_TICKERS = {
  bitcoin: ["btc", "bitcoin"],
  ethereum: ["eth", "ethereum"],
  solana: ["sol", "solana"],
  cardano: ["ada", "cardano"],
  ripple: ["xrp", "ripple", "ripplex"],
  dogecoin: ["doge", "dogecoin"],
};

const COIN_MEME_SUBS = {
  bitcoin: new Set(["bitcoinmemes", "bitcoin", "btc"]),
  ethereum: new Set(["ethtrader", "ethereum", "ethfinance"]),
  solana: new Set(["solana", "solanamemes"]),
  cardano: new Set(["cardano", "ada"]),
  ripple: new Set(["ripple", "xrp"]),
  dogecoin: new Set(["dogecoin", "doge"]),
};

// per-user recents to avoid repeats
const USER_MEME_RECENTS = new Map(); // userId -> { set, queue }

function _getUserRecents(userId) {
  const id = String(userId);
  if (!USER_MEME_RECENTS.has(id)) {
    USER_MEME_RECENTS.set(id, { set: new Set(), queue: [] });
  }
  return USER_MEME_RECENTS.get(id);
}

function _markUserRecent(userId, memeId) {
  const r = _getUserRecents(userId);
  if (r.set.has(memeId)) return;
  r.set.add(memeId);
  r.queue.push(memeId);
  while (r.queue.length > 80) {
    const old = r.queue.shift();
    r.set.delete(old);
  }
}

function _scoreMemeForUser(m, prefs) {
  const title = (m.title || "").toLowerCase();
  const subreddit = ((m.permalink || "").match(/\/r\/([^/]+)/)?.[1] || "").toLowerCase();

  const assets = Array.isArray(prefs?.assets) ? prefs.assets : [];
  const investorType = String(prefs?.investorType || "").toLowerCase();

  let score = 0;

  // coin hints in title / matching subs
  for (const idRaw of assets) {
    const id = String(idRaw || "").toLowerCase();
    const tickers = ID_TO_TICKERS[id] || [];
    for (const tk of tickers) {
      if (title.includes(tk)) score += 12;
    }
    const subs = COIN_MEME_SUBS[id];
    if (subs && subs.has(subreddit)) score += 25;
  }

  // tone by investor type (very light touch)
  const ST = /(pump|dump|spike|rally|sell[- ]?off|liquidat|volatil|leverage|rekt|pnl|scalp)/i;
  const LT = /(hodl|adoption|upgrade|etf|institution|regulat|roadmap|build|dev)/i;
  const DEFI = /(defi|dex|yield|airdrop|staking|liquidity|farm)/i;
  const RISK = /(rug|exploit|hack|scam)/i;

  switch (investorType) {
    case "trader":
    case "day_trader":
    case "short_term":
      if (ST.test(title)) score += 15;
      break;
    case "long_term":
    case "investor":
      if (LT.test(title)) score += 15;
      if (ST.test(title)) score -= 5;
      break;
    case "defi":
    case "builder":
      if (DEFI.test(title)) score += 12;
      break;
    case "conservative":
    case "risk_averse":
      if (RISK.test(title)) score -= 10;
      if (/(etf|upgrade|adoption)/i.test(title)) score += 8;
      break;
    default:
      break;
  }

  score += Math.random() * 3; // tiny entropy
  return score;
}

async function getRandomMemeForUser(userId, prefs) {
  const feed = await fetchRedditMemesFeed();
  if (!Array.isArray(feed) || feed.length === 0) {
    const m = await getRandomMeme();
    _markUserRecent(userId, m.id);
    return m;
  }

  const recents = _getUserRecents(userId).set;

  const scored = [];
  for (const m of feed) {
    if (!m?.id) continue;
    if (recents.has(m.id)) continue;
    const s = _scoreMemeForUser(m, prefs);
    scored.push({ m, s });
  }

  // pick from top slice with some randomness
  const pool = scored.length ? scored : feed.map((m) => ({ m, s: 0 }));
  pool.sort((a, b) => b.s - a.s);

  const top = pool.slice(0, 40);
  const pick = top[Math.floor(Math.random() * Math.min(8, top.length))] || top[0];

  const chosen = pick?.m || feed[0];
  _markUserRecent(userId, chosen.id);
  return chosen;
}

/* =========================
 * DASHBOARD (main handler)
 * ======================= */
async function getDashboard(req, res) {
  try {
    // load user prefs (may be null on first run)
    const prefsRow = await getPreferencesByUser(req.userId);
    const parsedPrefs = prefsRow
      ? {
          assets: prefsRow.assets ? JSON.parse(prefsRow.assets) : [],
          investorType: prefsRow.investor_type || "",
          contentTypes: prefsRow.content_types ? JSON.parse(prefsRow.content_types) : [],
        }
      : null;

    const assets =
      parsedPrefs && parsedPrefs.assets && parsedPrefs.assets.length
        ? parsedPrefs.assets
        : ["bitcoin", "ethereum"];

    // sticky news comes from per-user cache (no token burn here)
    const { items: news } = getUserNews(req.userId);

    // prices + daily AI in parallel
    const [prices, aiInsight] = await Promise.all([
      fetchPrices(assets),
      getDailyAiInsight(req.userId, {}, parsedPrefs || {}),
    ]);

    // one meme on initial load (personalized)
    const meme = await getRandomMemeForUser(req.userId, parsedPrefs || {});

    return res.json({
      preferences: parsedPrefs,
      sections: { news, prices, aiInsight, meme },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to load dashboard" });
  }
}

/* -------------
 * Exports
 * ----------- */
module.exports = {
  getDashboard,
  fetchPrices,
  fetchNews, // used by /news/refresh
  getRandomMeme,
  getRandomMemeForUser, // non-breaking additional export
  getNewsCachedHandler, // GET /api/dashboard/news
  refreshNewsHandler,   // POST /api/dashboard/news/refresh
};