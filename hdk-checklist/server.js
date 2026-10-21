import express from "express";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFileSync } from "fs";
import { createHmac, timingSafeEqual } from "crypto";
import pg from "pg";
import nodemailer from "nodemailer";
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

// Inspection kinds and the period each covers (mirrors src/checkKinds.ts)
const KINDS = ["daily", "weekly", "monthly", "yearly"];
const PERIOD_NAME = { daily: "Today's", weekly: "This week's", monthly: "This month's", yearly: "This year's" };
function periodKey(kind, dateGB) {
  const [d, m, y] = dateGB.split("/");
  if (kind === "daily") return dateGB;
  if (kind === "monthly") return `${m}/${y}`;
  if (kind === "yearly") return y;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 1) % 7)); // back to Saturday
  return [date.getUTCDate(), date.getUTCMonth() + 1].map((n) => String(n).padStart(2, "0")).join("/") + "/" + date.getUTCFullYear();
}
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
      // An edited date can move a periodic inspection into another period
      if (table === "inspection_logs" && KINDS.includes(item.kind) && DATE_RE.test(item.date)) item.periodKey = periodKey(item.kind, item.date);
      // Fault age tracking: stamp when a report is closed, clear it if reopened
      if (table === "fault_reports") {
        if (item.status === "Resolved") item.resolvedAt ??= new Date().toISOString();
        else delete item.resolvedAt;
      }
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

// ── Admin-editable config (checklist, operators, …); null → client uses its default ──
const isArray = (c) => Array.isArray(c);
function configRoutes(path, key, { validate = isArray, adminRead = false } = {}) {
  app.get(path, ...(adminRead ? [requireAdmin] : []), async (_req, res) => {
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
    if (config !== null && !validate(config)) return res.status(400).json({ error: "Invalid config." });
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
for (const kind of KINDS.slice(1)) configRoutes(`/api/checklist-config/${kind}`, `checklist_${kind}`);
// Engine service interval and the last service done
const optNum = (v) => v === undefined || (typeof v === "number" && Number.isFinite(v) && v >= 0);
configRoutes("/api/service-settings", "service", {
  validate: (c) => c && typeof c === "object" && !Array.isArray(c)
    && ["intervalHours", "intervalMonths", "lastServiceHours", "warnHours"].every((k) => optNum(c[k]))
    && (c.lastServiceDate === undefined || DATE_RE.test(c.lastServiceDate)),
});
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
  const body = req.body;
  if (!isId(body?.id) || !DATE_RE.test(body.date) || !String(body.operatorName || "").trim() || !Array.isArray(body.sections)) {
    return res.status(400).json({ error: "Invalid inspection log." });
  }
  const kind = body.kind ?? "daily";
  if (!KINDS.includes(kind)) return res.status(400).json({ error: "Invalid inspection kind." });
  const log = { ...body, kind, periodKey: periodKey(kind, body.date) };
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Serialise submissions so the limits below can't be raced
    await client.query("SELECT pg_advisory_xact_lock(hashtext('inspection_logs'))");
    const existing = await client.query("SELECT data FROM inspection_logs WHERE id = $1", [log.id]);
    if (existing.rowCount > 0) { await client.query("COMMIT"); return res.json({ ok: true }); }
    if (kind !== "daily") {
      // Weekly / monthly / yearly checks: one per period for the vehicle
      const done = await client.query(
        `SELECT data->>'operatorName' AS name, data->>'date' AS date FROM inspection_logs
         WHERE data->>'kind' = $1 AND data->>'periodKey' = $2 LIMIT 1`,
        [kind, log.periodKey]
      );
      if (done.rowCount > 0) {
        await client.query("ROLLBACK");
        const { name, date } = done.rows[0];
        return res.status(409).json({ error: `${PERIOD_NAME[kind]} ${kind} inspection was already submitted by ${name} on ${date}.`, operatorName: name });
      }
    } else {
      // Daily: one per device and one per operator each day
      const device = typeof log.deviceId === "string" ? log.deviceId.slice(0, 64) : "";
      const sameDay = await client.query(
        `SELECT data->>'operatorName' AS name, data->>'time' AS time, ($2 <> '' AND data->>'deviceId' = $2) AS by_device
         FROM inspection_logs
         WHERE data->>'date' = $1 AND COALESCE(data->>'kind', 'daily') = 'daily' AND (($2 <> '' AND data->>'deviceId' = $2) OR lower(trim(data->>'operatorName')) = lower(trim($3)))
         LIMIT 1`,
        [log.date, device, String(log.operatorName)]
      );
      if (sameDay.rowCount > 0) {
        await client.query("ROLLBACK");
        const { name, time, by_device } = sameDay.rows[0];
        const error = by_device
          ? `Today's inspection on this device was already submitted by ${name} at ${time}.`
          : `${name} already submitted an inspection today at ${time}.`;
        return res.status(409).json({ error, operatorName: name, time });
      }
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
    const saved = { ...report, repair, acceptance, status, ...(status === "Resolved" ? { resolvedAt: new Date().toISOString() } : {}) };
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

// ── Email (fault reports, monthly summaries) ─────────────────────────
// Everything is set by the admin in Setup → Email and kept in app_config ("email").
// SMTP_* environment variables still work as a fallback for the mail server.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PRIORITY_RANK = { Routine: 1, Urgent: 2, "Immediate Grounding": 3 };
const MAX_PDF_BYTES = 3_000_000; // stays under Vercel's 4.5 MB request limit once base64-encoded
const oneLine = (v, max) => String(v ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, max);

async function loadEmailSettings() {
  const rows = await pool.query("SELECT key, data FROM app_config WHERE key IN ('email', 'notify_emails')");
  const byKey = Object.fromEntries(rows.rows.map((r) => [r.key, r.data]));
  const s = byKey.email ?? {};
  return {
    host: s.host || process.env.SMTP_HOST || (s.user || process.env.SMTP_USER ? "smtp.gmail.com" : ""),
    port: s.port || Number(process.env.SMTP_PORT) || 465,
    security: s.security || "ssl",
    user: s.user || process.env.SMTP_USER || "",
    pass: s.pass || process.env.SMTP_PASS || "",
    fromName: s.fromName || "HDK ARFF — RESCUE 2",
    fromAddress: s.fromAddress || s.user || process.env.MAIL_FROM || process.env.SMTP_USER || "",
    replyTo: s.replyTo || "",
    to: s.to ?? byKey.notify_emails ?? [],   // notify_emails: recipients saved by the first version
    cc: s.cc ?? [],
    subjectPrefix: s.subjectPrefix ?? "",
    footer: s.footer ?? "",
    faultEmails: s.faultEmails ?? true,
    minPriority: s.minPriority || "Routine",
  };
}

/** Problems that stop email from working, or null when it's ready */
function emailProblem(s) {
  if (!s.host || !s.user || !s.pass) return "The mail server isn't set up. An admin can do it under Setup → Email.";
  if (s.to.length === 0) return "No email recipients set. An admin can add them under Setup → Email.";
  return null;
}

async function sendToRecipients({ subject, text, pdf, filename }, settings) {
  const s = settings ?? await loadEmailSettings();
  const problem = emailProblem(s);
  if (problem) return { status: 503, error: problem };
  // The PDF is optional (a test email has none), but if given it must be a real, modest PDF
  const content = pdf === undefined ? null : typeof pdf === "string" ? Buffer.from(pdf, "base64") : Buffer.alloc(0);
  if (content && (content.length > MAX_PDF_BYTES || content.subarray(0, 5).toString() !== "%PDF-")) {
    return { status: 400, error: "Invalid or too large PDF." };
  }
  const transport = nodemailer.createTransport({
    host: s.host,
    port: s.port,
    secure: s.security === "ssl",
    requireTLS: s.security === "starttls",
    auth: { user: s.user, pass: s.pass },
    connectionTimeout: 15_000,
  });
  await transport.sendMail({
    from: { name: oneLine(s.fromName, 100), address: s.fromAddress },
    to: s.to,
    cc: s.cc.length ? s.cc : undefined,
    replyTo: s.replyTo || undefined,
    subject: oneLine(`${s.subjectPrefix ? `${s.subjectPrefix} ` : ""}${subject}`, 200),
    text: s.footer ? `${text}\n\n--\n${s.footer}` : text,
    attachments: content ? [{ filename: String(filename).replace(/[^\w.\- ]/g, "_").slice(0, 120) || "report.pdf", content, contentType: "application/pdf" }] : [],
  });
  return { status: 200, sent: s.to.length + s.cc.length };
}

const emailList = (v) => Array.isArray(v) && v.length <= 20 && v.every((e) => typeof e === "string" && e.length <= 254 && EMAIL_RE.test(e));
const optEmail = (v) => v === undefined || v === "" || (typeof v === "string" && v.length <= 254 && EMAIL_RE.test(v));
const optText = (v, max) => v === undefined || (typeof v === "string" && v.length <= max);

// The password is write-only: it's never sent back, only whether one is saved
app.get("/api/email-settings", requireAdmin, async (_req, res) => {
  if (!pool) return res.status(503).json({ error: "No database configured." });
  try {
    const { pass, ...rest } = await loadEmailSettings();
    const stored = (await pool.query("SELECT data FROM app_config WHERE key = 'email'")).rows[0]?.data ?? {};
    // Show the from address as saved: blank means "use the username" at send time
    res.json({ settings: { ...rest, fromAddress: stored.fromAddress ?? "", hasPassword: !!pass, passwordFromEnv: !stored.pass && !!pass }, problem: emailProblem({ ...rest, pass }) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "DB query failed." });
  }
});

app.put("/api/email-settings", requireAdmin, async (req, res) => {
  if (!pool) return res.status(503).json({ error: "No database configured." });
  const b = req.body?.settings ?? {};
  const port = Number(b.port);
  const valid = optText(b.host, 253) && Number.isInteger(port) && port > 0 && port < 65536
    && ["ssl", "starttls", "none"].includes(b.security) && optText(b.user, 254) && optText(b.pass, 200)
    && optText(b.fromName, 100) && optEmail(b.fromAddress) && optEmail(b.replyTo)
    && emailList(b.to ?? []) && emailList(b.cc ?? []) && optText(b.subjectPrefix, 60) && optText(b.footer, 1000)
    && typeof b.faultEmails === "boolean" && PRIORITY_RANK[b.minPriority];
  if (!valid) return res.status(400).json({ error: "Some email settings are invalid." });
  try {
    const old = (await pool.query("SELECT data FROM app_config WHERE key = 'email'")).rows[0]?.data ?? {};
    const settings = {
      host: oneLine(b.host, 253), port, security: b.security, user: oneLine(b.user, 254),
      // Blank keeps the saved password; clearPassword removes it
      pass: b.clearPassword ? "" : b.pass ? b.pass : old.pass ?? "",
      fromName: oneLine(b.fromName, 100), fromAddress: b.fromAddress || "", replyTo: b.replyTo || "",
      to: b.to ?? [], cc: b.cc ?? [], subjectPrefix: oneLine(b.subjectPrefix, 60), footer: String(b.footer ?? ""),
      faultEmails: b.faultEmails, minPriority: b.minPriority,
    };
    await pool.query(
      `INSERT INTO app_config (key, data, updated_at) VALUES ('email', $1, NOW())
       ON CONFLICT (key) DO UPDATE SET data = $1, updated_at = NOW()`,
      [JSON.stringify(settings)]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "DB update failed." });
  }
});

// A new fault report is emailed once, by the device that created it, within a day
app.post("/api/fault-reports/:id/email", writeLimit, async (req, res) => {
  if (!pool) return res.status(503).json({ error: "No database configured." });
  if (typeof req.body?.pdf !== "string") return res.status(400).json({ error: "PDF missing." });
  try {
    const settings = await loadEmailSettings();
    const problem = emailProblem(settings);
    if (problem) return res.status(503).json({ error: problem });
    if (!settings.faultEmails) return res.json({ ok: true, sent: 0, skipped: "Fault report emails are turned off in Setup." });
    // Claim the report atomically so it can't be sent twice
    const claimed = await pool.query(
      `UPDATE fault_reports SET data = data || jsonb_build_object('emailedAt', $2::text)
       WHERE id = $1 AND NOT (data ? 'emailedAt') AND created_at > NOW() - INTERVAL '1 day'
       RETURNING data`,
      [req.params.id, new Date().toISOString()]
    );
    if (claimed.rowCount === 0) return res.status(409).json({ error: "Already emailed, or not a new report." });
    const r = claimed.rows[0].data;
    if ((PRIORITY_RANK[r.priority] ?? 1) < PRIORITY_RANK[settings.minPriority]) {
      return res.json({ ok: true, sent: 0, skipped: `Only ${settings.minPriority} faults and above are emailed (Setup → Email).` });
    }
    const faults = (r.faults ?? []).map((f) => `  • [${f.status}] ${f.label}${f.remarks ? ` — ${f.remarks}` : ""}`).join("\n");
    const result = await sendToRecipients({
      subject: `Fault report ${r.reportNumber} — ${r.priority} — RESCUE 2`,
      text: `A new fault report was raised for RESCUE 2 (HDK-ARFF).\n\nReport: ${r.reportNumber}\nDate: ${r.date} ${r.time}\nReported by: ${r.operatorName}\nPriority: ${r.priority}\n\nFaults:\n${faults}\n\n${r.detailsOfDefects ?? ""}\n\nThe full report is attached.`,
      pdf: req.body?.pdf,
      filename: req.body?.filename,
    }, settings);
    if (result.status !== 200) {
      await pool.query("UPDATE fault_reports SET data = data - 'emailedAt' WHERE id = $1", [req.params.id]);
      return res.status(result.status).json({ error: result.error });
    }
    await pool.query("UPDATE fault_reports SET data = data || jsonb_build_object('emailedTo', $2::int) WHERE id = $1", [req.params.id, result.sent]);
    res.json({ ok: true, sent: result.sent });
  } catch (e) {
    console.error("Fault report email failed:", e);
    await pool.query("UPDATE fault_reports SET data = data - 'emailedAt' WHERE id = $1", [req.params.id]).catch(() => {});
    res.status(502).json({ error: "Email could not be sent." });
  }
});

// Admin: email a document (monthly summary, test) to the recipients
app.post("/api/email", requireAdmin, async (req, res) => {
  if (!pool) return res.status(503).json({ error: "No database configured." });
  try {
    const { subject, text, pdf, filename } = req.body ?? {};
    const result = await sendToRecipients({ subject: subject || "HDK ARFF — RESCUE 2", text: String(text || "").slice(0, 5000), pdf, filename });
    if (result.status !== 200) return res.status(result.status).json({ error: result.error });
    res.json({ ok: true, sent: result.sent });
  } catch (e) {
    console.error("Email failed:", e);
    // Admin-only, so the mail server's reason (e.g. wrong password) helps fix the settings
    res.status(502).json({ error: `Email could not be sent: ${oneLine(e?.message, 200) || "check the mail server settings"}.` });
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
  res.json({ ok: true, ai: !!process.env.ANTHROPIC_API_KEY, db: !!pool,  ts: new Date().toISOString() });
});

// ── Serve built frontend in production ────────────────────────────────
// (On Vercel the frontend is served as static files and this file runs as the /api function)
if (process.env.NODE_ENV === "production" && !process.env.VERCEL) {
  const distDir = join(__dirname, "dist");
  app.use(express.static(distDir));
  app.get("/{*splat}", (_req, res) => {
    res.send(readFileSync(join(distDir, "index.html"), "utf8"));
  });
}

if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`HDK ARFF server → http://localhost:${PORT}`);
    console.log(`  AI: ${process.env.ANTHROPIC_API_KEY ? "✓" : "✗"}  DB: ${pool ? "✓" : "✗ (no DATABASE_URL)"}`);
  });
}

export default app;
