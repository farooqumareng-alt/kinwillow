"use client";
import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="page" style={{ textAlign: "center" }}>
      <h1>Something went wrong</h1>
      <p className="sans">
        This page couldn&rsquo;t load. Your vault and everything in it are unaffected.
      </p>
      <p className="sans" style={{ marginTop: 22 }}>
        <button className="btn" onClick={reset}>Try again</button>
      </p>
      <p className="sans" style={{ marginTop: 14 }}>
        If it keeps happening, <a href="/contact">tell us</a>
        {error.digest ? <> and mention reference <code>{error.digest}</code></> : null}.
      </p>
    </main>
  );
}
