import { Suspense } from "react";
import { requireStaff } from "@/lib/auth";
import { money } from "@/lib/format";

export const metadata = { title: "Fleet" };

export default function FleetPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Fleet</h1>
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <FleetTable />
      </Suspense>
      {/* TODO: add/edit vehicle, maintenance blocks, price plan editor (manager+ only, via Edge Functions) */}
    </div>
  );
}

async function FleetTable() {
  const { db } = await requireStaff();
  const { data, error } = await db
    .from("vehicles")
    .select("id, plate, make, model, engine_cc, status, odometer_km, branches(name), price_plans(name, hourly, daily, currency)")
    .order("plate");
  if (error) return <p role="alert" className="text-red-600">Could not load fleet.</p>;
  type Row = { id: string; plate: string; make: string; model: string; engine_cc: number | null; status: string; odometer_km: number; branches: { name: string } | null; price_plans: { name: string; hourly: number; daily: number; currency: string } | null };
  const rows = (data ?? []) as unknown as Row[];
  if (!rows.length) return <p className="text-muted">No vehicles yet.</p>;
  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full text-left text-sm">
        <thead className="bg-panel text-muted">
          <tr>{["Plate", "Bike", "Branch", "Plan", "Odometer", "Status"].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((v) => (
            <tr key={v.id}>
              <td className="px-3 py-2 font-mono">{v.plate}</td>
              <td className="px-3 py-2">{v.make} {v.model}{v.engine_cc ? ` · ${v.engine_cc} cc` : ""}</td>
              <td className="px-3 py-2">{v.branches?.name}</td>
              <td className="px-3 py-2">{v.price_plans ? `${v.price_plans.name} · ${money(v.price_plans.hourly, v.price_plans.currency)}/h · ${money(v.price_plans.daily, v.price_plans.currency)}/day` : "—"}</td>
              <td className="px-3 py-2 tabular-nums">{v.odometer_km.toLocaleString()} km</td>
              <td className="px-3 py-2 capitalize">{v.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
