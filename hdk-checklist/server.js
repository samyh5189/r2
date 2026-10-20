import express from "express";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFileSync } from "fs";
import { createHmac, timingSafeEqual } from "crypto";
import pg from "pg";
import "dotenv/config";

const { Pool } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: "20mb" }));

// ── PostgreSQL ────────────────────────────────────────────────────────
let pool = null;
if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
  });
  pool.query(`
    CREATE TABLE IF NOT EXISTS inspection_logs (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS fault_reports (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS app_config (
      key TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS deleted_records (
      id TEXT PRIMARY KEY,
      deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)
    .then(() => console.log("✓ DB tables ready"))
    .catch((e) => console.error("DB init error:", e));
}

// ── Admin auth ────────────────────────────────────────────────────────
// Admin signs in with ADMIN_EMAIL + ADMIN_PASSWORD (Railway variables) and gets a
// signed token; edit/delete endpoints require it. Changing the password revokes tokens.
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "9799744@gmail.com").toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function sign(payload) {
  return createHmac("sha256", ADMIN_PASSWORD).update(payload).digest("base64url");
}

function safeEqual(a, b) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function requireAdmin(req, res, next) {
  if (!ADMIN_PASSWORD) return res.status(503).json({ error: "Admin not configured." });
  const token = (req.headers.authorization || "").replace(/^Bearer /, "");
  const [payload, sig] = token.split(".");
  if (!payload || !sig || !safeEqual(sig, sign(payload))) return res.status(401).json({ error: "Not signed in." });
  const { email, exp } = JSON.parse(Buffer.from(payload, "base64url").toString());
  if (email !== ADMIN_EMAIL || Date.now() > exp) return res.status(401).json({ error: "Session expired." });
  next();
}

app.post("/api/admin/login", (req, res) => {
  if (!ADMIN_PASSWORD) return res.status(503).json({ error: "Admin not configured on this server." });
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  if (email !== ADMIN_EMAIL || !safeEqual(password, ADMIN_PASSWORD)) {
    return res.status(401).json({ error: "Wrong email or password." });
  }
  const payload = Buffer.from(JSON.stringify({ email, exp: Date.now() + TOKEN_TTL_MS })).toString("base64url");
  res.json({ token: `${payload}.${sign(payload)}`, email });
});

// Shared admin update/delete handlers for a JSONB table
function adminRoutes(path, table) {
  app.put(`${path}/:id`, requireAdmin, async (req, res) => {
    if (!pool) return res.status(503).json({ error: "No database configured." });
    try {
      const item = { ...req.body, id: req.params.id };
      const result = await pool.query(`UPDATE ${table} SET data = $2 WHERE id = $1`, [req.params.id, item]);
      if (result.rowCount === 0) return res.status(404).json({ error: "Not found." });
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "DB update failed." });
    }
  });

  app.delete(`${path}/:id`, requireAdmin, async (req, res) => {
    if (!pool) return res.status(503).json({ error: "No database configured." });
    try {
      // Remember the id so a device syncing old localStorage can't re-insert it
      await pool.query(`INSERT INTO deleted_records (id) VALUES ($1) ON CONFLICT DO NOTHING`, [req.params.id]);
      await pool.query(`DELETE FROM ${table} WHERE id = $1`, [req.params.id]);
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "DB delete failed." });
    }
  });
}

// ── Checklist config (admin-editable; null → client uses built-in default) ──
app.get("/api/checklist-config", async (_req, res) => {
  if (!pool) return res.status(503).json({ error: "No database configured." });
  try {
    const result = await pool.query("SELECT data FROM app_config WHERE key = 'checklist'");
    res.json({ config: result.rows[0]?.data ?? null });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "DB query failed." });
  }
});

app.put("/api/checklist-config", requireAdmin, async (req, res) => {
  if (!pool) return res.status(503).json({ error: "No database configured." });
  const config = req.body?.config;
  if (config !== null && !Array.isArray(config)) return res.status(400).json({ error: "Invalid config." });
  try {
    if (config === null) await pool.query("DELETE FROM app_config WHERE key = 'checklist'");
    else await pool.query(
      `INSERT INTO app_config (key, data, updated_at) VALUES ('checklist', $1, NOW())
       ON CONFLICT (key) DO UPDATE SET data = $1, updated_at = NOW()`,
      [JSON.stringify(config)]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "DB update failed." });
  }
});

adminRoutes("/api/logs", "inspection_logs");
adminRoutes("/api/fault-reports", "fault_reports");

// ── Inspection logs ───────────────────────────────────────────────────
app.get("/api/logs", async (_req, res) => {
  if (!pool) return res.status(503).json({ error: "No database configured." });
  try {
    const result = await pool.query(
      "SELECT data FROM inspection_logs ORDER BY created_at DESC"
    );
    res.json(result.rows.map((r) => r.data));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "DB query failed." });
  }
});

app.post("/api/logs", async (req, res) => {
  if (!pool) return res.status(503).json({ error: "No database configured." });
  try {
    const log = req.body;
    await pool.query(
      `INSERT INTO inspection_logs (id, data, created_at)
       SELECT $1, $2, $3 WHERE NOT EXISTS (SELECT 1 FROM deleted_records WHERE id = $1)
       ON CONFLICT (id) DO NOTHING`,
      [log.id, log, log.createdAt]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "DB insert failed." });
  }
});

// ── Fault reports ─────────────────────────────────────────────────────
app.get("/api/fault-reports", async (_req, res) => {
  if (!pool) return res.status(503).json({ error: "No database configured." });
  try {
    const result = await pool.query(
      "SELECT data FROM fault_reports ORDER BY created_at DESC"
    );
    res.json(result.rows.map((r) => r.data));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "DB query failed." });
  }
});

app.post("/api/fault-reports", async (req, res) => {
  if (!pool) return res.status(503).json({ error: "No database configured." });
  try {
    const report = req.body;
    await pool.query(
      `INSERT INTO fault_reports (id, data, created_at)
       SELECT $1, $2, $3 WHERE NOT EXISTS (SELECT 1 FROM deleted_records WHERE id = $1)
       ON CONFLICT (id) DO NOTHING`,
      [report.id, report, report.createdAt]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "DB insert failed." });
  }
});

// ── AI proxy ──────────────────────────────────────────────────────────
app.post("/api/fault-report", async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(503).json({ error: "AI service not configured on this server." });
  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(req.body),
    });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    console.error("Anthropic proxy error:", err);
    res.status(500).json({ error: "Proxy request failed." });
  }
});

// ── Health check ──────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, ai: !!process.env.ANTHROPIC_API_KEY, db: !!pool, ts: new Date().toISOString() });
});

// ── Serve built frontend in production ────────────────────────────────
if (process.env.NODE_ENV === "production") {
  const distDir = join(__dirname, "dist");
  app.use(express.static(distDir));
  app.get("/{*splat}", (_req, res) => {
    res.send(readFileSync(join(distDir, "index.html"), "utf8"));
  });
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`HDK ARFF server → http://localhost:${PORT}`);
  console.log(`  AI: ${process.env.ANTHROPIC_API_KEY ? "✓" : "✗"}  DB: ${pool ? "✓" : "✗ (no DATABASE_URL)"}`);
});
