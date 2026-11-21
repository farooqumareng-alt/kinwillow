"use client";
import { useEffect, useState } from "react";

// "Install the app" panel for Settings. Chrome, Edge and Android offer a real
// install prompt; iPhone and iPad have no such prompt, so they get the two
// taps to do it by hand.
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

export default function InstallApp() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setInstalled(standalone);
    const ua = navigator.userAgent;
    // iPadOS reports itself as a Mac, so also check for touch.
    setIos(/iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1));

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPrompt);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!prompt) return;
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === "accepted") setInstalled(true);
    setPrompt(null);
  }

  return (
    <div className="panel sans">
      <h3>Install the app</h3>
      {installed ? (
        <p>KinWillow is installed on this device. Open it from your home screen or app list.</p>
      ) : prompt ? (
        <>
          <p>Put KinWillow on this device&rsquo;s home screen. It opens like an app, with no browser bar.</p>
          <button className="btn" style={{ marginTop: 10 }} onClick={install}>Install KinWillow</button>
        </>
      ) : ios ? (
        <>
          <p>To put KinWillow on your home screen:</p>
          <ol style={{ paddingLeft: 20, marginTop: 6, color: "var(--muted)", fontSize: 15 }}>
            <li>Open this page in <strong>Safari</strong>.</li>
            <li>Tap the <strong>Share</strong> button (the square with an arrow).</li>
            <li>Choose <strong>Add to Home Screen</strong>, then <strong>Add</strong>.</li>
          </ol>
        </>
      ) : (
        <p>
          In Chrome or Edge, open the browser menu and choose <strong>Install KinWillow</strong> (or{" "}
          <strong>Add to Home screen</strong> on Android). If you don&rsquo;t see it, this browser may
          not support installing sites.
        </p>
      )}
      <p style={{ marginTop: 10, fontSize: 14 }}>
        For your safety the app keeps nothing from your vault on the device, so it needs a
        connection, and it signs out after 30 minutes without use.
      </p>
    </div>
  );
}
