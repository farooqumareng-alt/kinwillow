"use client";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SignOutButton() {
  const router = useRouter();
  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }
  return (
    <button
      onClick={signOut}
      className="sans"
      style={{ background: "none", border: "none", color: "var(--green-dark)", fontSize: 15, cursor: "pointer", padding: 0 }}
    >
      Sign out
    </button>
  );
}
