"use client";

import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      className="rounded-md border border-line px-2.5 py-1 hover:bg-panel"
      onClick={async () => {
        await supabaseBrowser().auth.signOut();
        router.replace("/login");
        router.refresh();
      }}>
      Sign out
    </button>
  );
}
