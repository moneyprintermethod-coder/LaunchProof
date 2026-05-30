const sqlite3 = require('sqlite3');
const path = require('path');
const dbPath = path.join(__dirname, 'launchproof.sqlite');

const db = new sqlite3.Database(dbPath);

const init = () => {
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS startups (
        id TEXT PRIMARY KEY,
        slug TEXT UNIQUE,
        idea TEXT,
        name TEXT,
        headline TEXT,
        subheadline TEXT,
        cta_text TEXT,
        og_image TEXT,
        validation_questions TEXT,
        price_test_variants TEXT,
        validation_status TEXT DEFAULT 'collecting',
        min_signups_for_verdict INTEGER DEFAULT 50,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        startup_id TEXT PRIMARY KEY,
        tier TEXT DEFAULT 'free',
        billing_period TEXT,
        status TEXT DEFAULT 'active',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        expires_at TEXT,
        FOREIGN KEY(startup_id) REFERENCES startups(id)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS waitlist_entries (
        id TEXT PRIMARY KEY,
        startup_id TEXT,
        email TEXT,
        intent_score INTEGER,
        validation_answers TEXT,
        willingness_to_pay REAL,
        price_variant_shown INTEGER,
        converted_at_price INTEGER,
        signal_quality TEXT,
        fingerprint_hash TEXT,
        ip_country TEXT,
        utm_source TEXT,
        utm_campaign TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(startup_id) REFERENCES startups(id)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS validation_verdicts (
        id TEXT PRIMARY KEY,
        startup_id TEXT,
        snapshot_date TEXT,
        total_signups INTEGER,
        high_intent_pct REAL,
        avg_willingness_to_pay REAL,
        spam_pct REAL,
        best_price_point REAL,
        recommendation TEXT,
        reasoning TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(startup_id) REFERENCES startups(id)
      )
    `);
  });
};

module.exports = { db, init };
