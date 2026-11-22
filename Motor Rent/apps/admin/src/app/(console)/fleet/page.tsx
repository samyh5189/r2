import Link from "next/link";
import { Suspense } from "react";
import { requireStaff } from "@/lib/auth";
import { money } from "@/lib/format";
import { AddVehicle } from "./add-vehicle";
import type { VehicleColour } from "@motor-rent/shared";
import { PricePlans, type Plan } from "./price-plans";
import { DeleteVehicle, VehicleForm, type Option } from "./vehicle-form";
import { VehiclePhotos, type Kind } from "./vehicle-photos";

export const metadata = { title: "Fleet" };

export default function FleetPage() {
  return (
    <div className="space-y-8">
      <Suspense fallback={<p className="animate-pulse text-muted">Loading…</p>}>
        <Fleet />
      </Suspense>
    </div>
  );
}

const STOCK: Record<Kind, string> = { scooter: "/stock/scooter.jpg", motorbike: "/stock/motorbike.jpg", car: "/stock/car.jpg" };

type Row = {
  id: string; kind: Kind; photos: string[]; plate: string; make: string; model: string; engine_cc: number | null; year: number | null;
  status: "active" | "maintenance" | "retired"; odometer_km: number; branch_id: string; price_plan_id: string; colour: VehicleColour | null;
  branches: { name: string } | null;
  price_plans: { name: string; hourly: number; daily: number; currency: string } | null;
};

async function Fleet() {
  const { db, user } = await requireStaff();
  const canEdit = user.role === "manager" || user.role === "owner";
  const [vehicles, branches, plans] = await Promise.all([
    db.from("vehicles")
      .select("id, kind, photos, plate, make, model, engine_cc, year, colour, status, odometer_km, branch_id, price_plan_id, branches(name), price_plans(name, hourly, daily, currency)")
      .order("status").order("plate"),
    db.from("branches").select("id, name").order("name"),
    db.from("price_plans").select("id, name, currency, hourly, daily, weekly, deposit, late_fee_per_hour, active").order("hourly"),
  ]);
  if (vehicles.error || branches.error || plans.error) return <p role="alert" className="text-red-600">Could not load fleet.</p>;

  const rows = (vehicles.data ?? []) as unknown as Row[];
  const branchOpts = (branches.data ?? []) as Option[];
  const planRows: Plan[] = (plans.data ?? []).map((p) => ({ ...p, vehicles: rows.filter((r) => r.price_plan_id === p.id && r.status !== "retired").length })) as Plan[];
  const planOpts: Option[] = planRows.filter((p) => p.active).map((p) => ({ id: p.id, name: `${p.name} · ${money(p.hourly, p.currency)}/h · ${money(p.daily, p.currency)}/day` }));

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Fleet</h1>
          <p className="text-sm text-muted">Add vehicles, upload and crop real photos, set prices. The first photo is what riders see.</p>
        </div>
        {canEdit && <AddVehicle branches={branchOpts} plans={planOpts} />}
      </div>

      {!rows.length ? <p className="text-muted">No vehicles yet. Add your first one.</p> : (
        <ul className="space-y-3">
          {rows.map((v) => {
            const cover = v.photos[0] ?? STOCK[v.kind];
            return (
              <li key={v.id} className={`overflow-hidden rounded-2xl border border-line bg-panel ${v.status === "retired" ? "opacity-60" : ""}`}>
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center gap-3 p-3 sm:gap-4 hover:bg-background/60 [&::-webkit-details-marker]:hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={cover} alt="" className={`h-14 w-20 flex-none rounded-lg object-cover sm:h-16 sm:w-24 ${v.photos.length ? "" : "opacity-60 grayscale"}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-semibold">{v.make} {v.model}</span>
                        <Link href={`/fleet/${v.id}`} className="plate text-xs" title="Vehicle history">{v.plate}</Link>
                      </div>
                      <div className="text-sm text-muted">
                        <span className="capitalize">{v.kind}</span>
                        {v.engine_cc ? ` · ${v.engine_cc} cc` : ""} · {v.branches?.name}
                        {v.price_plans ? ` · ${money(v.price_plans.hourly, v.price_plans.currency)}/h · ${money(v.price_plans.daily, v.price_plans.currency)}/day` : ""}
                      </div>
                    </div>
                    <span className={`hidden rounded-full px-2 py-0.5 text-xs font-semibold sm:inline ${v.photos.length ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-amber-500/15 text-amber-700 dark:text-amber-400"}`}>
                      {v.photos.length ? `${v.photos.length} photo${v.photos.length > 1 ? "s" : ""}` : "No photos"}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${v.status === "active" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-background"}`}>{v.status}</span>
                    <span className="text-muted transition group-open:rotate-90">›</span>
                  </summary>
                  <div className="space-y-6 border-t border-line p-4">
                    <VehiclePhotos vehicleId={v.id} label={`${v.make} ${v.model}`} kind={v.kind} photos={v.photos} canEdit={canEdit} />
                    {canEdit && (
                      <>
                        <div className="space-y-2">
                          <h3 className="text-sm font-semibold text-muted">Details and price</h3>
                          <VehicleForm branches={branchOpts} plans={planOpts.length ? planOpts : [{ id: v.price_plan_id, name: v.price_plans?.name ?? "Current plan" }]}
                            initial={{ id: v.id, kind: v.kind, plate: v.plate, make: v.make, model: v.model, engine_cc: v.engine_cc, year: v.year,
                              branch_id: v.branch_id, price_plan_id: v.price_plan_id, status: v.status, odometer_km: v.odometer_km, colour: v.colour ?? null }} />
                        </div>
                        <div className="border-t border-line pt-4">
                          <DeleteVehicle id={v.id} label={`${v.make} ${v.model} (${v.plate})`} photos={v.photos} />
                        </div>
                      </>
                    )}
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}

      <PricePlans plans={planRows} canEdit={canEdit} />
    </>
  );
}
