"use client";
import { useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { setActiveHousehold } from "@/lib/household";

// Opened from an invitation email by a signed-in user. Accepting is a button
// press, not a page view, so nothing happens just because the link was opened.
export default function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [wrongAccount, setWrongAccount] = useState(false);

  async function accept() {
    setBusy(true);
    setError("");
    const res = await fetch("/api/helpers/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.household_id) {
      setError(json.error ?? "The invitation could not be accepted.");
      setWrongAccount(Boolean(json.wrong_account));
      setBusy(false);
      return;
    }
    setActiveHousehold(json.household_id);
    window.location.assign("/app");
  }

  async function switchAccount() {
    await createClient().auth.signOut({ scope: "local" }).catch(() => {});
    window.location.assign(`/login?next=/app/accept-invite/${token}`);
  }

  return (
    <main>
      <h1 style={{ marginBottom: 6 }}>You&rsquo;ve been invited to help with a vault</h1>
      <div className="panel sans" style={{ maxWidth: 620, marginTop: 18 }}>
        <p>
          Someone has asked you to help manage their KinWillow vault. If you accept, you&rsquo;ll be
          able to open it from the box above the menu and switch back to your own at any time.
        </p>
        <p style={{ marginTop: 8 }}>
          They stay the owner and can remove you whenever they wish. You can also stop helping
          yourself, from the Helpers page.
        </p>
        {error && <div className="error" role="alert">{error}</div>}
        <div className="row" style={{ marginTop: 16 }}>
          {wrongAccount ? (
            <button className="btn" onClick={switchAccount}>Sign in with the invited address</button>
          ) : (
            <button className="btn" onClick={accept} disabled={busy}>
              {busy ? "Accepting…" : "Accept and open the vault"}
            </button>
          )}
          <a href="/app">Not now</a>
        </div>
      </div>
    </main>
  );
}
