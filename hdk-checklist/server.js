import express from "express";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFileSync } from "fs";
import "dotenv/config";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: "10mb" }));

// ── AI proxy route ────────────────────────────────────────────────────
// Keeps the Anthropic API key entirely server-side.
app.post("/api/fault-report", async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: "AI service not configured on this server." });
  }

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
  res.json({
    ok: true,
    ai: !!process.env.ANTHROPIC_API_KEY,
    ts: new Date().toISOString(),
  });
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
  const keyStatus = process.env.ANTHROPIC_API_KEY ? "✓ API key loaded" : "✗ No API key set";
  console.log(`HDK ARFF server → http://localhost:${PORT}  [${keyStatus}]`);
  if (process.env.NODE_ENV === "production") {
    console.log("Serving built frontend from /dist");
  } else {
    console.log("Dev mode — Vite frontend runs separately on :5173");
  }
});
