"use client";
import { useEffect } from "react";

// Registers the service worker that makes KinWillow installable (see
// public/sw.js). Production only, so local development never serves stale
// files from a cache.
export default function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((err) => {
        console.error("Service worker registration failed", err);
      });
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);
  return null;
}
