// Is the site running inside the Play Store or App Store app (rather than a
// browser or a home-screen install)?
//
// It matters for one thing: store apps are subject to the stores' rules on
// selling digital subscriptions, so the app does not show purchase buttons.
// People on a paid plan keep everything; changing plan happens on the website.
//
// Detected from, in order: a launch marker the wrappers add to the start URL
// (?source=twa for Android, ?source=ios-app for iOS), Android's referrer for
// Trusted Web Activities, and a marker in the iOS wrapper's user agent. The
// result is remembered for the browser session, since the marker is only on
// the first page.
const KEY = "kw-store-app";

export function inStoreApp(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (sessionStorage.getItem(KEY) === "1") return true;
    const source = new URLSearchParams(window.location.search).get("source");
    const detected =
      source === "twa" ||
      source === "ios-app" ||
      document.referrer.startsWith("android-app://") ||
      navigator.userAgent.includes("KinWillowApp");
    if (detected) sessionStorage.setItem(KEY, "1");
    return detected;
  } catch {
    return false;
  }
}
