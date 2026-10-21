import { useEffect, useMemo, useState } from "react";
import type { InspectionLog, ItemStatus } from "../types";
import { getLogs } from "../storage";
import { logKind } from "../checkKinds";
import { analyzeTrends, type Finding, type TrendReport } from "../trends";

const WINDOWS = [30, 60, 90];
const SEVERITY_LABEL = { high: "Act now", medium: "Plan maintenance", low: "Watch" } as const;

function StatusStrip({ history }: { history: ItemStatus[] }) {
  return (
    <div className="trend-strip" aria-label="Recent inspections, oldest to newest">
      {history.map((s, i) => <span key={i} className={`trend-dot s-${s === "U/S" ? "US" : s || "none"}`} title={s || "—"} />)}
    </div>
  );
}

async function askAI(report: TrendReport, windowDays: number): Promise<string> {
  const lines = report.findings.slice(0, 15).map((f) => `- ${f.label} (${f.section}): ${f.reasons.join("; ")}. Recent: ${f.history.join(" ")}`);
  const readings = report.readings.map((r) => `- ${r.label}: latest ${r.latest}${r.unit ? ` ${r.unit}` : ""}${r.perDay != null ? `, ${r.perDay.toFixed(2)}/day` : ""}${r.max != null ? `, max ${r.max}` : ""}${r.min != null ? `, min ${r.min}` : ""}`);
  const prompt = `You are an ARFF vehicle maintenance officer at Kulhudhuffushi Airport (HDK), Maldives, reviewing ${report.inspections} daily inspections of RESCUE 2 over the last ${windowDays} days (${report.totalFaults} faults recorded).

Items flagged by trend analysis:
${lines.join("\n") || "- none"}

Numeric readings:
${readings.join("\n") || "- none"}

Give concise preventive-maintenance advice: the top priorities (most urgent first), likely root causes for recurring or intermittent faults, and what to inspect or service before it fails. Plain text, short bullet points, max 12 bullets.`;

  const res = await fetch("/api/fault-report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 900, messages: [{ role: "user", content: prompt }] }),
  });
  if (!res.ok) throw new Error(`AI error ${res.status}`);
  const data = await res.json();
  return data.content?.[0]?.text ?? "No advice returned.";
}

function FindingCard({ f }: { f: Finding }) {
  return (
    <div className={`trend-card sev-${f.severity}`}>
      <div className="trend-card-head">
        <div>
          <div className="trend-label">{f.label}</div>
          <div className="trend-section">{f.section}</div>
        </div>
        <span className={`trend-sev sev-${f.severity}`}>{SEVERITY_LABEL[f.severity]}</span>
      </div>
      <ul className="trend-reasons">{f.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
      <StatusStrip history={f.history} />
    </div>
  );
}

export default function TrendsPage() {
  const [logs, setLogs] = useState<InspectionLog[] | null>(null);
  const [windowDays, setWindowDays] = useState(30);
  const [advice, setAdvice] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  // Trends follow the daily inspections, which run on a steady cadence
  useEffect(() => { getLogs().then((all) => setLogs(all.filter((l) => logKind(l) === "daily"))); }, []);
  const report = useMemo(() => (logs ? analyzeTrends(logs, windowDays) : null), [logs, windowDays]);

  if (!report) return <div className="container" style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>Analysing inspections…</div>;

  const faultRate = report.inspections ? Math.round((report.inspectionsWithFaults / report.inspections) * 100) : 0;

  async function getAdvice() {
    setAsking(true);
    try { setAdvice(await askAI(report!, windowDays)); }
    catch (e) { setAdvice(e instanceof Error ? e.message : "AI request failed."); }
    setAsking(false);
  }

  return (
    <div className="container">
      <div className="trend-toolbar">
        <strong>Trends & preventive maintenance</strong>
        <div className="trend-windows">
          {WINDOWS.map((w) => (
            <button key={w} className={`trend-window${w === windowDays ? " active" : ""}`} onClick={() => { setWindowDays(w); setAdvice(null); }}>{w}d</button>
          ))}
        </div>
      </div>

      <div className="trend-stats">
        <div><strong>{report.inspections}</strong>inspections</div>
        <div><strong>{report.totalFaults}</strong>faults</div>
        <div><strong>{faultRate}%</strong>with faults</div>
        <div><strong>{report.findings.filter((f) => f.severity !== "low").length}</strong>need attention</div>
      </div>

      {report.inspections === 0 ? (
        <p className="empty-state">No inspections in the last {windowDays} days.</p>
      ) : (
        <>
          <h3 className="trend-heading">Watchlist</h3>
          {report.findings.length === 0
            ? <p className="trend-empty">No recurring or worsening faults. 👍</p>
            : report.findings.map((f) => <FindingCard key={f.itemId} f={f} />)}

          {report.readings.length > 0 && (
            <>
              <h3 className="trend-heading">Readings</h3>
              <div className="trend-readings">
                {report.readings.map((r) => (
                  <div key={r.itemId} className="trend-reading">
                    <span className="trend-label">{r.label}</span>
                    <span><strong>{r.latest}</strong> {r.unit}</span>
                    <span className="trend-section">
                      {r.perDay != null ? `${r.perDay >= 0 ? "+" : ""}${r.perDay.toFixed(2)} ${r.unit}/day` : "Need 2+ readings for a rate"}
                      {r.daysToLimit != null && (r.daysToLimit === 0 ? " · outside limits" : ` · limit in ~${Math.ceil(r.daysToLimit)}d`)}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          <h3 className="trend-heading">AI maintenance advice</h3>
          {advice
            ? <div className="assessment-box" style={{ whiteSpace: "pre-wrap" }}>{advice}</div>
            : <button className="btn-export" onClick={getAdvice} disabled={asking}>{asking ? "Analysing…" : "Get preventive maintenance advice"}</button>}
        </>
      )}
    </div>
  );
}
