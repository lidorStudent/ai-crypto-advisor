// backend/src/db.js
// Tiny SQLite wrapper for users, preferences, and feedback (like/dislike).
// Goal here: keep it simple, readable, and stable. No functional changes.

const path = require("path");
const sqlite3 = require("sqlite3").verbose();

/* ────────────────────────────────────────────────────────────
   Database connection
   - Uses a single SQLite file at project root: ./database.sqlite
   - Safe to import across the app (one process).
   ──────────────────────────────────────────────────────────── */
const dbFile = path.join(__dirname, "..", "database.sqlite");
const db = new sqlite3.Database(dbFile);

/* ────────────────────────────────────────────────────────────
   init()
   - Creates the tables if they don't exist.
   - Adds a UNIQUE index on (user_id, target_type, target_id) in feedback.
   - Dedupes old feedback rows before adding the index (keeps the newest).
   ──────────────────────────────────────────────────────────── */
function init() {
  db.serialize(() => {
    // Users: basic auth profile
    db.run(
      `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`
    );

    // Preferences: one row per user (onboarding answers)
    db.run(
      `CREATE TABLE IF NOT EXISTS preferences (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER UNIQUE,
        assets TEXT,
        investor_type TEXT,
        content_types TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`
    );

    // Feedback: like/dislike per content item
    db.run(
      `CREATE TABLE IF NOT EXISTS feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        target_type TEXT,
        target_id TEXT,
        vote INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`
    );

    // Before adding UNIQUE index: remove duplicates and keep the latest row.
    db.run(
      `DELETE FROM feedback
       WHERE rowid NOT IN (
         SELECT MAX(rowid)
         FROM feedback
         GROUP BY user_id, target_type, target_id
       )`,
      (err) => {
        if (err) {
          console.warn("[db] feedback dedupe failed:", err.message);
        }
        // Enforce one row per (user, type, id) for XOR/toggle semantics
        db.run(
          `CREATE UNIQUE INDEX IF NOT EXISTS idx_feedback_unique
           ON feedback (user_id, target_type, target_id)`,
          (idxErr) => {
            if (idxErr) {
              // Log and keep going; we can still operate without the index.
              console.warn("[db] create unique index failed:", idxErr.message);
            }
          }
        );
      }
    );
  });
}

/* ────────────────────────────────────────────────────────────
   Users
   ──────────────────────────────────────────────────────────── */
/**
 * Find a user by email.
 * @param {string} email
 * @returns {Promise<Object|undefined>}
 */
function getUserByEmail(email) {
  return new Promise((resolve, reject) => {
    db.get("SELECT * FROM users WHERE email = ?", [email], (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

/**
 * Find a user by id.
 * @param {number} id
 * @returns {Promise<Object|undefined>}
 */
function getUserById(id) {
  return new Promise((resolve, reject) => {
    db.get("SELECT * FROM users WHERE id = ?", [id], (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

/**
 * Create a new user.
 * @param {{name:string,email:string,passwordHash:string}} param0
 * @returns {Promise<number>} last inserted id
 */
function createUser({ name, email, passwordHash }) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(
      "INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)"
    );
    stmt.run([name, email, passwordHash], function (err) {
      if (err) return reject(err);
      resolve(this.lastID); // sqlite last inserted row id
    });
    stmt.finalize();
  });
}

/* ────────────────────────────────────────────────────────────
   Preferences
   ──────────────────────────────────────────────────────────── */
/**
 * Get preferences by user id (raw DB row).
 * @param {number} userId
 * @returns {Promise<Object|undefined>}
 */
function getPreferencesByUser(userId) {
  return new Promise((resolve, reject) => {
    db.get(
      "SELECT * FROM preferences WHERE user_id = ?",
      [userId],
      (err, row) => {
        if (err) return reject(err);
        resolve(row);
      }
    );
  });
}

/**
 * Upsert preferences for a user.
 * Accepts plain objects; we JSON.stringify arrays for storage.
 * @param {number} userId
 * @param {{assets?:string[], investorType?:string, contentTypes?:string[]}} prefs
 */
function upsertPreferences(userId, prefs) {
  return new Promise((resolve, reject) => {
    getPreferencesByUser(userId)
      .then((existing) => {
        const assets = JSON.stringify(prefs.assets || []);
        const investorType = prefs.investorType || "";
        const contentTypes = JSON.stringify(prefs.contentTypes || []);

        if (existing) {
          // Update existing row
          db.run(
            "UPDATE preferences SET assets = ?, investor_type = ?, content_types = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?",
            [assets, investorType, contentTypes, userId],
            (err) => (err ? reject(err) : resolve())
          );
        } else {
          // Insert new row
          db.run(
            "INSERT INTO preferences (user_id, assets, investor_type, content_types) VALUES (?, ?, ?, ?)",
            [userId, assets, investorType, contentTypes],
            (err) => (err ? reject(err) : resolve())
          );
        }
      })
      .catch(reject);
  });
}

/* ────────────────────────────────────────────────────────────
   Feedback (likes/dislikes with XOR + toggle-to-clear)
   ──────────────────────────────────────────────────────────── */
/**
 * Legacy insert (kept for back-compat). Prefer upsertFeedbackVote/clearFeedback.
 */
function insertFeedback(userId, targetType, targetId, vote) {
  return new Promise((resolve, reject) => {
    db.run(
      "INSERT INTO feedback (user_id, target_type, target_id, vote) VALUES (?, ?, ?, ?)",
      [userId, targetType, targetId, vote],
      (err) => (err ? reject(err) : resolve())
    );
  });
}

/**
 * Upsert a vote. Passing 0/null/undefined clears the row.
 * @param {number} userId
 * @param {string} targetType
 * @param {string} targetId
 * @param {-1|0|1|null|undefined} vote
 */
function upsertFeedbackVote(userId, targetType, targetId, vote) {
  return new Promise((resolve, reject) => {
    // Clear if vote is "empty"
    if (vote === 0 || vote === null || typeof vote === "undefined") {
      db.run(
        "DELETE FROM feedback WHERE user_id = ? AND target_type = ? AND target_id = ?",
        [userId, targetType, targetId],
        (err) => (err ? reject(err) : resolve())
      );
      return;
    }

    // Try native UPSERT (SQLite 3.24+)
    const sql = `
      INSERT INTO feedback (user_id, target_type, target_id, vote)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, target_type, target_id)
      DO UPDATE SET vote = excluded.vote, created_at = CURRENT_TIMESTAMP
    `;
    db.run(sql, [userId, targetType, targetId, vote], (err) => {
      if (!err) return resolve();

      // If UPSERT isn't supported, emulate with a small transaction.
      if (!/near\s+"ON"|syntax error/i.test(err.message)) return reject(err);

      db.serialize(() => {
        db.run("BEGIN IMMEDIATE");
        db.run(
          "DELETE FROM feedback WHERE user_id = ? AND target_type = ? AND target_id = ?",
          [userId, targetType, targetId]
        );
        db.run(
          "INSERT INTO feedback (user_id, target_type, target_id, vote) VALUES (?, ?, ?, ?)",
          [userId, targetType, targetId, vote],
          (insErr) => {
            if (insErr) {
              db.run("ROLLBACK", () => reject(insErr));
            } else {
              db.run("COMMIT", (cmErr) => (cmErr ? reject(cmErr) : resolve()));
            }
          }
        );
      });
    });
  });
}

/**
 * Clear a vote (same as upsertFeedbackVote with 0).
 */
function clearFeedback(userId, targetType, targetId) {
  return new Promise((resolve, reject) => {
    db.run(
      "DELETE FROM feedback WHERE user_id = ? AND target_type = ? AND target_id = ?",
      [userId, targetType, targetId],
      (err) => (err ? reject(err) : resolve())
    );
  });
}

/**
 * Get votes for a list of target IDs (for painting pressed buttons).
 * Returns a map like { [targetId]: -1|0|1 } (missing means 0).
 * @returns {Promise<Record<string, number>>}
 */
function getFeedbackForTargets(userId, targetType, targetIds) {
  return new Promise((resolve, reject) => {
    if (!Array.isArray(targetIds) || targetIds.length === 0) {
      return resolve({});
    }
    const placeholders = targetIds.map(() => "?").join(",");
    const sql = `
      SELECT target_id, vote
      FROM feedback
      WHERE user_id = ?
        AND target_type = ?
        AND target_id IN (${placeholders})
    `;
    db.all(sql, [userId, targetType, ...targetIds], (err, rows) => {
      if (err) return reject(err);
      const out = {};
      for (const r of rows || []) out[r.target_id] = Number(r.vote) || 0;
      resolve(out);
    });
  });
}

/**
 * Get recent votes for a given type (handy for caching on the client).
 */
function getAllFeedbackForType(userId, targetType, limit = 1000) {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT target_id, vote
      FROM feedback
      WHERE user_id = ?
        AND target_type = ?
      ORDER BY created_at DESC
      LIMIT ?
    `;
    db.all(sql, [userId, targetType, limit], (err, rows) => {
      if (err) return reject(err);
      const out = {};
      for (const r of rows || []) out[r.target_id] = Number(r.vote) || 0;
      resolve(out);
    });
  });
}

/* ────────────────────────────────────────────────────────────
   Exports
   ──────────────────────────────────────────────────────────── */
module.exports = {
  init,
  // users
  getUserByEmail,
  getUserById,
  createUser,
  // preferences
  getPreferencesByUser,
  upsertPreferences,
  // feedback (legacy + new helpers)
  insertFeedback,
  upsertFeedbackVote,
  clearFeedback,
  getFeedbackForTargets,
  getAllFeedbackForType,
};