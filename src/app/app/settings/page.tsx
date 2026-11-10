"use client";

import { useEffect, useState } from "react";
import { getMyHousehold, type HouseholdInfo } from "@/lib/household";

export default function SettingsPage() {
  const [household, setHousehold] = useState<HouseholdInfo | null>(null);

  useEffect(() => {
    (async () => setHousehold(await getMyHousehold()))();
  }, []);

  return (
    <main>
      <h1 style={{ fontSize: 32, color: "var(--green-dark)", fontWeight: "normal", marginBottom: 6 }}>
        Settings
      </h1>
      <p className="sans" style={{ color: "var(--muted)", marginBottom: 24 }}>
        {household ? `${household.name} · Plan: ${household.plan_tier} · Status: ${household.status}` : ""}
      </p>

      <div className="grid">
        <div className="panel sans">
          <h3>Export your data</h3>
          <p>
            Download everything in your vault as a single file — items, documents index, continuity
            records with your recovery instructions, contacts and scopes. Always available, even if
            billing lapses.
          </p>
          <a className="btn" style={{ marginTop: 10, display: "inline-block" }} href="/api/export">
            Download my export
          </a>
        </div>
        <div className="panel sans">
          <h3>Security</h3>
          <p>Multi-factor authentication and sign-in security live on the Security page.</p>
          <a className="btn secondary" style={{ marginTop: 10, display: "inline-block" }} href="/app/security">
            Open Security (MFA)
          </a>
        </div>
        <div className="panel sans">
          <h3>Delete this vault</h3>
          <p>
            Deletion is permanent and only ever happens at your explicit request: download an export
            first, then contact us from the contact page and we will verify and delete your vault
            after a 30-day grace period. If billing simply lapses, your vault is sealed — never
            deleted.
          </p>
          <a className="btn secondary" style={{ marginTop: 10, display: "inline-block" }} href="/contact?topic=other">
            Contact us about deletion
          </a>
        </div>
      </div>
    </main>
  );
}
