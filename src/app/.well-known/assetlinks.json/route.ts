import { NextResponse } from "next/server";

// Digital Asset Links: proves to Android that the KinWillow app in the Play
// Store and this website belong to the same owner, so the app opens the site
// full-screen with no browser bar (a "Trusted Web Activity").
//
// Set in Vercel, then redeploy:
//   ANDROID_PACKAGE_NAME   the app's package id (default com.kinwillow.app)
//   ANDROID_CERT_SHA256    the signing certificate's SHA-256 fingerprint(s),
//                          comma-separated. Use the "App signing key
//                          certificate" from Play Console → Setup → App
//                          signing, plus the upload key's if you test builds
//                          installed outside the Play Store.
// Until the fingerprint is set this returns an empty list, which is valid and
// simply means no app is linked yet.
export const dynamic = "force-dynamic";

export function GET() {
  const packageName = process.env.ANDROID_PACKAGE_NAME?.trim() || "com.kinwillow.app";
  const fingerprints = (process.env.ANDROID_CERT_SHA256 ?? "")
    .split(",")
    .map((f) => f.trim().toUpperCase())
    .filter((f) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(f));

  const body =
    fingerprints.length === 0
      ? []
      : [
          {
            relation: ["delegate_permission/common.handle_all_urls"],
            target: {
              namespace: "android_app",
              package_name: packageName,
              sha256_cert_fingerprints: fingerprints,
            },
          },
        ];
  return NextResponse.json(body, { headers: { "Cache-Control": "public, max-age=300" } });
}
