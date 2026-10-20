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
app.set("trust proxy", 1); // Railway sits behind a proxy; use the real client IP for rate limits
app.use(express.json({ limit: "20mb" }));

// Simple per-IP fixed-window rate limiter for the public write endpoints
function rateLimit(max, windowMs) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const rec = hits.get(req.ip);
    if (!rec || now > rec.reset) hits.set(req.ip, { count: 1, reset: now + windowMs });
    else if (++rec.count > max) return res.status(429).json({ error: "Too many requests — try again later." });
    if (hits.size > 5000) for (const [k, v] of hits) if (now > v.reset) hits.delete(k);
    next();
  };
}
const HOUR = 60 * 60 * 1000;
const writeLimit = rateLimit(60, HOUR);
const aiLimit = rateLimit(30, HOUR);

const DATE_RE = /^\d{2}\/\d{2}\/\d{4}$/;
const isId = (v) => typeof v === "string" && v.length > 0 && v.length <= 64;

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

// ── Admin-editable config (checklist, operators); null → client uses its default ──
function configRoutes(path, key) {
  app.get(path, async (_req, res) => {
    if (!pool) return res.status(503).json({ error: "No database configured." });
    try {
      const result = await pool.query("SELECT data FROM app_config WHERE key = $1", [key]);
      res.json({ config: result.rows[0]?.data ?? null });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "DB query failed." });
    }
  });

  app.put(path, requireAdmin, async (req, res) => {
    if (!pool) return res.status(503).json({ error: "No database configured." });
    const config = req.body?.config;
    if (config !== null && !Array.isArray(config)) return res.status(400).json({ error: "Invalid config." });
    try {
      if (config === null) await pool.query("DELETE FROM app_config WHERE key = $1", [key]);
      else await pool.query(
        `INSERT INTO app_config (key, data, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET data = $2, updated_at = NOW()`,
        [key, JSON.stringify(config)]
      );
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "DB update failed." });
    }
  });
}

configRoutes("/api/checklist-config", "checklist");
configRoutes("/api/operators", "operators");

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

app.post("/api/logs", writeLimit, async (req, res) => {
  if (!pool) return res.status(503).json({ error: "No database configured." });
  const log = req.body;
  if (!isId(log?.id) || !DATE_RE.test(log.date) || !String(log.operatorName || "").trim() || !Array.isArray(log.sections)) {
    return res.status(400).json({ error: "Invalid inspection log." });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Serialise submissions so two devices can't both create today's inspection
    await client.query("SELECT pg_advisory_xact_lock(hashtext('inspection_logs'))");
    const existing = await client.query("SELECT data FROM inspection_logs WHERE id = $1", [log.id]);
    if (existing.rowCount > 0) { await client.query("COMMIT"); return res.json({ ok: true }); }
    const sameDay = await client.query(
      "SELECT data->>'operatorName' AS name, data->>'time' AS time FROM inspection_logs WHERE data->>'date' = $1 LIMIT 1",
      [log.date]
    );
    if (sameDay.rowCount > 0) {
      await client.query("ROLLBACK");
      const { name, time } = sameDay.rows[0];
      return res.status(409).json({ error: `Today's inspection was already submitted by ${name} at ${time}.`, operatorName: name, time });
    }
    await client.query(
      `INSERT INTO inspection_logs (id, data, created_at)
       SELECT $1, $2, $3 WHERE NOT EXISTS (SELECT 1 FROM deleted_records WHERE id = $1)`,
      [log.id, log, log.createdAt]
    );
    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(e);
    res.status(500).json({ error: "DB insert failed." });
  } finally {
    client.release();
  }
});

// Shift in-charge sign-off: once per log, by a name on the operators list marked in-charge
app.post("/api/logs/:id/signoff", writeLimit, async (req, res) => {
  if (!pool) return res.status(503).json({ error: "No database configured." });
  const name = String(req.body?.name || "").trim();
  const signature = String(req.body?.signature || "");
  if (!name || !signature.startsWith("data:image/png;base64,") || signature.length > 500_000) {
    return res.status(400).json({ error: "Name and signature are required." });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const ops = await client.query("SELECT data FROM app_config WHERE key = 'operators'");
    const allowed = (ops.rows[0]?.data ?? []).some((o) => o.inCharge && o.name === name);
    if (!allowed) { await client.query("ROLLBACK"); return res.status(403).json({ error: "Only a shift in-charge on the operators list can sign off." }); }
    const row = await client.query("SELECT data FROM inspection_logs WHERE id = $1 FOR UPDATE", [req.params.id]);
    if (row.rowCount === 0) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Inspection not found." }); }
    const log = row.rows[0].data;
    if (log.shiftSignoff) { await client.query("ROLLBACK"); return res.status(409).json({ error: `Already signed off by ${log.shiftSignoff.name}.` }); }
    const shiftSignoff = { name, signature, signedAt: new Date().toISOString() };
    await client.query("UPDATE inspection_logs SET data = data || $2::jsonb WHERE id = $1", [req.params.id, { shiftSignoff }]);
    // The linked fault report prints the same sign-off in its Shift In-Charge row
    await client.query("UPDATE fault_reports SET data = data || $2::jsonb WHERE data->>'inspectionLogId' = $1", [req.params.id, { shiftSignoff }]);
    await client.query("COMMIT");
    res.json({ ok: true, shiftSignoff });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(e);
    res.status(500).json({ error: "Sign-off failed." });
  } finally {
    client.release();
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

app.post("/api/fault-reports", writeLimit, async (req, res) => {
  if (!pool) return res.status(503).json({ error: "No database configured." });
  const report = req.body;
  if (!isId(report?.id) || !DATE_RE.test(report.date) || !Array.isArray(report.faults)) {
    return res.status(400).json({ error: "Invalid fault report." });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Number reports here, under a lock, so simultaneous submissions never share a number
    await client.query("SELECT pg_advisory_xact_lock(hashtext('fault_report_number'))");
    const existing = await client.query("SELECT data FROM fault_reports WHERE id = $1", [report.id]);
    if (existing.rowCount > 0) { await client.query("COMMIT"); return res.json({ ok: true, report: existing.rows[0].data }); }
    const deleted = await client.query("SELECT 1 FROM deleted_records WHERE id = $1", [report.id]);
    if (deleted.rowCount > 0) { await client.query("ROLLBACK"); return res.status(410).json({ error: "This report was deleted." }); }
    const prefix = `HDK-ARFF/${report.date.slice(6)}/`;
    const max = await client.query(
      `SELECT COALESCE(MAX(NULLIF(regexp_replace(data->>'reportNumber', '^.*/', ''), '')::int), 0) AS n
       FROM fault_reports WHERE data->>'reportNumber' LIKE $1 AND data->>'reportNumber' ~ '/[0-9]+$'`,
      [prefix + "%"]
    );
    const saved = { ...report, reportNumber: prefix + String(max.rows[0].n + 1).padStart(2, "0") };
    await client.query("INSERT INTO fault_reports (id, data, created_at) VALUES ($1, $2, $3)", [saved.id, saved, saved.createdAt]);
    await client.query("COMMIT");
    res.json({ ok: true, report: saved });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(e);
    res.status(500).json({ error: "DB insert failed." });
  } finally {
    client.release();
  }
});

// Repair workflow (maintenance team): fills the form's repair + acceptance sections.
// Status follows progress; a Resolved report is locked (admin edit only).
const REPAIR_KEYS = ["desiredStartDate", "desiredStartTime", "requiredEndDate", "requiredEndTime", "repairedBy", "repairedBySignature", "details", "remarks"];
const ACCEPT_KEYS = ["date", "time", "requiredEndDate", "requiredEndTime", "comments", "maintenanceName", "maintenanceSignature", "arffName", "arffSignature"];

function pickFields(input, keys) {
  const out = {};
  for (const k of keys) {
    const v = input?.[k];
    if (typeof v !== "string") continue;
    if (k.endsWith("Signature")) { if (v.startsWith("data:image/png;base64,") && v.length <= 500_000) out[k] = v; }
    else if (k.endsWith("Date")  || k === "date") { if (v === "" || DATE_RE.test(v)) out[k] = v; }
    else if (k.endsWith("Time") || k === "time") { if (v === "" || /^\d{2}:\d{2}$/.test(v)) out[k] = v; }
    else out[k] = v.slice(0, 2000);
  }
  return out;
}

app.post("/api/fault-reports/:id/repair", writeLimit, async (req, res) => {
  if (!pool) return res.status(503).json({ error: "No database configured." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const row = await client.query("SELECT data FROM fault_reports WHERE id = $1 FOR UPDATE", [req.params.id]);
    if (row.rowCount === 0) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Report not found." }); }
    const report = row.rows[0].data;
    if (report.status === "Resolved") { await client.query("ROLLBACK"); return res.status(409).json({ error: "This report is closed. Ask an admin to reopen it." }); }
    // A signature, once given, can't be replaced
    const merge = (old = {}, upd) => {
      for (const k of Object.keys(upd)) if (k.endsWith("Signature") && old[k]) delete upd[k];
      return { ...old, ...upd };
    };
    const repair = merge(report.repair, pickFields(req.body?.repair, REPAIR_KEYS));
    const acceptance = merge(report.acceptance, pickFields(req.body?.acceptance, ACCEPT_KEYS));
    const accepted = acceptance.maintenanceName && acceptance.maintenanceSignature && acceptance.arffName && acceptance.arffSignature;
    const started = Object.values(repair).some(Boolean) || Object.values(acceptance).some(Boolean);
    const status = accepted ? "Resolved" : started ? "In Progress" : report.status;
    const saved = { ...report, repair, acceptance, status };
    await client.query("UPDATE fault_reports SET data = $2 WHERE id = $1", [req.params.id, saved]);
    await client.query("COMMIT");
    res.json({ ok: true, report: saved });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(e);
    res.status(500).json({ error: "Repair update failed." });
  } finally {
    client.release();
  }
});

// ── AI proxy ──────────────────────────────────────────────────────────
// Only the app's own requests are forwarded: one text prompt, fixed model, capped output
const AI_MODEL = "claude-sonnet-4-6";
const AI_MAX_TOKENS = 1500;
const AI_MAX_PROMPT = 12_000;

app.post("/api/fault-report", aiLimit, async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(503).json({ error: "AI service not configured on this server." });
  const messages = req.body?.messages;
  const prompt = Array.isArray(messages) && messages.length === 1 && messages[0]?.role === "user" ? messages[0].content : null;
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > AI_MAX_PROMPT) {
    return res.status(400).json({ error: "Invalid AI request." });
  }
  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: AI_MODEL,
        max_tokens: Math.min(Number(req.body.max_tokens) || AI_MAX_TOKENS, AI_MAX_TOKENS),
        messages: [{ role: "user", content: prompt }],
      }),
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
