import { Suspense } from "react";
import { requireStaff } from "@/lib/auth";
import { BankAccounts, type BankAccount } from "./bank-accounts";
import { HeroSettings } from "./hero-settings";
import { SupportContacts } from "./support-contacts";
import { ConnectWhatsApp, MyWhatsApp, type WaTemplate } from "./whatsapp-settings";

export const metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted">WhatsApp, the home page photo, support contacts and the bank accounts riders pay into.</p>
      </div>
      <Suspense fallback={<p className="animate-pulse text-muted">Loading…</p>}>
        <Settings />
      </Suspense>
    </div>
  );
}

async function Settings() {
  const { db, user } = await requireStaff();
  const canEdit = user.role === "manager" || user.role === "owner";
  const [settings, accounts, me, templates] = await Promise.all([
    db.from("site_settings").select("hero_image_url, hero_credit, bank_transfer_note, support_phone, support_email, whatsapp_ready").single(),
    db.from("bank_accounts").select("id, bank_name, account_name, account_number, currency, swift, note, active, sort").order("sort").order("created_at"),
    db.from("profiles").select("whatsapp, whatsapp_verified, whatsapp_alerts").eq("id", user.id).single(),
    db.from("whatsapp_templates").select("name, audience, body, status, rejected_reason").order("audience").order("name"),
  ]);
  if (settings.error || accounts.error) return <p role="alert" className="text-red-600">Could not load settings.</p>;
  return (
    <>
      <section id="whatsapp" className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">WhatsApp</h2>
          <p className="text-sm text-muted">Riders get booking updates, reminders and office replies on WhatsApp; staff get alerts.</p>
        </div>
        <MyWhatsApp userId={user.id} number={me.data?.whatsapp ?? null} verified={!!me.data?.whatsapp_verified} alerts={me.data?.whatsapp_alerts ?? true} ready={!!settings.data.whatsapp_ready} />
        <ConnectWhatsApp ready={!!settings.data.whatsapp_ready} isOwner={user.role === "owner"} templates={(templates.data ?? []) as WaTemplate[]} />
      </section>
      <HeroSettings url={settings.data.hero_image_url} credit={settings.data.hero_credit} note={settings.data.bank_transfer_note} canEdit={canEdit} />
      <SupportContacts phone={settings.data.support_phone} email={settings.data.support_email} canEdit={canEdit} />
      <BankAccounts accounts={(accounts.data ?? []) as BankAccount[]} note={settings.data.bank_transfer_note}
        hero={{ url: settings.data.hero_image_url, credit: settings.data.hero_credit }} canEdit={canEdit} />
    </>
  );
}
