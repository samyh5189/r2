// Gathers everything for the signed rental agreement, builds the PDF and stores it with the booking.
import type { SupabaseClient } from "@supabase/supabase-js";
import { AGREEMENT_VERSION } from "@shared/agreement.ts";
import { buildContract, sha256Hex } from "./contract.ts";
import { parseTstzRange } from "./range.ts";

const LABELS: Record<string, string> = { front: "Front", back: "Back", left: "Left side", right: "Right side", dashboard: "Dashboard (odometer)", "close-ups": "Scratches / damage" };

export async function makeAgreement(db: SupabaseClient, bookingId: string): Promise<{ path: string; sha256: string }> {
  const { data: b, error } = await db.from("bookings")
    .select("id, reference, period, total, deposit, currency, terms_version, handover, delivery_address, rider_id, guest_name, guest_phone, price_snapshot, counter_full_name, counter_id_type, counter_id_number, counter_licence_number, counter_licence_categories, counter_licence_expires_on, counter_date_of_birth, vehicles!inner(make, model, plate, kind, colour), branches!inner(name, address)")
    .eq("id", bookingId).single();
  if (error || !b) throw new Error("booking not found");
  const { data: insp } = await db.from("inspections")
    .select("odometer_km, engine_hours, fuel_level, notes, photo_paths, rider_signature_path, staff_signature_path, staff_id, checklist, created_at")
    .eq("booking_id", bookingId).eq("phase", "pickup").single();
  if (!insp) throw new Error("no pickup inspection");

  const [{ data: staff }, { data: site }, profileRes, kycRes] = await Promise.all([
    db.from("profiles").select("full_name").eq("id", insp.staff_id).single(),
    db.from("site_settings").select("company_legal_name, company_reg_no, company_address, support_phone, support_email").single(),
    b.rider_id ? db.from("profiles").select("full_name, phone, kyc_status").eq("id", b.rider_id).single() : Promise.resolve({ data: null }),
    b.rider_id ? db.from("kyc_submissions").select("full_name, date_of_birth, id_type, id_number, licence_number, licence_expires_on, licence_categories")
      .eq("profile_id", b.rider_id).eq("status", "approved").order("reviewed_at", { ascending: false }).limit(1).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const profile = profileRes.data as { full_name: string | null; phone: string | null; kyc_status: string } | null;
  const kyc = kycRes.data as { full_name: string; date_of_birth: string; id_type: string; id_number: string; licence_number: string; licence_expires_on: string; licence_categories: string[] | null } | null;
  // The licence check that allowed this handover: the counter check when staff did one, else the verified account.
  const counter = !!b.counter_id_number;
  const rider = counter || !kyc ? {
    name: b.counter_full_name ?? profile?.full_name ?? b.guest_name ?? "Rider", dateOfBirth: b.counter_date_of_birth, idType: b.counter_id_type,
    idNumber: b.counter_id_number, licenceNumber: b.counter_licence_number, licenceExpires: b.counter_licence_expires_on,
    categories: b.counter_licence_categories ?? [], phone: profile?.phone ?? b.guest_phone, checkedBy: "checked at the counter" as const,
  } : {
    name: kyc.full_name, dateOfBirth: kyc.date_of_birth, idType: kyc.id_type, idNumber: kyc.id_number, licenceNumber: kyc.licence_number,
    licenceExpires: kyc.licence_expires_on, categories: kyc.licence_categories ?? [], phone: profile?.phone ?? null, checkedBy: "verified account" as const,
  };

  const download = async (path: string) => {
    const { data } = await db.storage.from("inspections").download(path);
    return data ? new Uint8Array(await data.arrayBuffer()) : null;
  };
  const [riderSig, staffSig, ...photoBytes] = await Promise.all([
    download(insp.rider_signature_path), download(insp.staff_signature_path), ...(insp.photo_paths as string[]).slice(0, 8).map(download),
  ]);
  const photos = (insp.photo_paths as string[]).slice(0, 8).flatMap((p, i) => {
    const bytes = photoBytes[i];
    const key = /\/([a-z-]+)-\d+\.jpg$/.exec(p)?.[1] ?? "";
    return bytes ? [{ label: LABELS[key] ?? "Photo", bytes }] : [];
  });
  const v = b.vehicles as unknown as { make: string; model: string; plate: string; kind: string; colour: string | null };
  const br = b.branches as unknown as { name: string; address: string | null };
  const { start, end } = parseTstzRange(b.period);
  const snap = (b.price_snapshot ?? {}) as { lines?: { label: string; amount: number }[] };

  const pdf = await buildContract({
    reference: b.reference, bookingId: b.id, signedAt: new Date(insp.created_at),
    company: { name: "EasyRide", tagline: "Kulhudhuffushi MotoRentals", legalName: site?.company_legal_name ?? null, regNo: site?.company_reg_no ?? null,
      address: site?.company_address ?? br.address ?? null, phone: site?.support_phone ?? null, email: site?.support_email ?? null },
    rider, vehicle: v, start, end, handover: b.handover === "delivery" ? "delivery" : "counter",
    place: b.handover === "delivery" ? (b.delivery_address ?? "-") : `${br.name}${br.address ? `, ${br.address}` : ""}`,
    currency: b.currency, total: b.total, deposit: b.deposit, lines: snap.lines ?? [],
    odometer: insp.odometer_km, engineHours: insp.engine_hours, fuel: insp.fuel_level, checklist: insp.checklist as Record<string, string> | null,
    notes: insp.notes, staffName: staff?.full_name ?? "EasyRide staff", termsVersion: b.terms_version,
    riderSignature: riderSig ? new TextDecoder().decode(riderSig) : "", staffSignature: staffSig ? new TextDecoder().decode(staffSig) : "",
    photos,
  });
  const path = `${b.id}/rental-agreement-${b.reference}.pdf`;
  const { error: upErr } = await db.storage.from("contracts").upload(path, pdf, { contentType: "application/pdf", upsert: true });
  if (upErr) throw upErr;
  const sha256 = await sha256Hex(pdf);
  await db.from("bookings").update({ contract_path: path, contract_sha256: sha256, contract_signed_at: insp.created_at, agreement_version: AGREEMENT_VERSION }).eq("id", b.id);
  return { path, sha256 };
}
