import { Suspense } from "react";
import { requireStaff } from "@/lib/auth";
import { BlockList, type Block } from "./block-list";

export const metadata = { title: "Blocklist" };

export default function BlocklistPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl tracking-tight">Blocklist</h1>
        <p className="text-sm text-muted">
          People who may not rent: unpaid balances, damage, abuse. <b>Staff only.</b> Riders never see this list. A blocked person just
          can&apos;t book, and is matched by account, phone or email.
        </p>
      </div>
      <Suspense fallback={<p className="animate-pulse text-muted">Loading…</p>}>
        <List />
      </Suspense>
    </div>
  );
}

async function List() {
  const { db, user } = await requireStaff();
  const { data, error } = await db.from("rider_blocks")
    .select("id, full_name, phone, email, id_number, reason, amount_owed, currency, photo_path, active, created_at")
    .order("active", { ascending: false }).order("created_at", { ascending: false });
  if (error) return <p role="alert" className="text-red-600">Could not load the blocklist.</p>;
  const rows = data ?? [];
  const paths = rows.map((r) => r.photo_path).filter(Boolean) as string[];
  const { data: signed } = paths.length ? await db.storage.from("blocklist").createSignedUrls(paths, 60 * 30) : { data: [] };
  const urlOf = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  const blocks: Block[] = rows.map((r) => ({ ...r, photoUrl: r.photo_path ? urlOf.get(r.photo_path) ?? null : null })) as Block[];
  return <BlockList blocks={blocks} canEdit={user.role === "manager" || user.role === "owner"} userId={user.id} />;
}
