"use client";

import { useEffect, useState } from "react";

/** Shape returned by GET /api/settings/public. Two booleans, nothing else. */
export type PublicSettings = {
  acceptingOrders: boolean;
  developmentNotice: boolean;
};

/**
 * What the old server-rendered reads resolved to when a value was missing or
 * the read failed: only an explicit `false` closes orders, only an explicit
 * `true` shows the notice. The endpoint applies the same rules, so a failed
 * request lands here on exactly the values the UI used to show.
 */
const FALLBACK: PublicSettings = {
  acceptingOrders: true,
  developmentNotice: false,
};

let inflight: Promise<PublicSettings> | null = null;

/**
 * Shared by the footer status pill and the development notice, both of which
 * render on the same page — one in-flight promise is the whole dedupe this
 * needs. Caching the promise (not the value) is deliberate: `getSiteSetting`
 * already caches server-side, and a rejected fetch is also worth not retrying
 * per-consumer. A full page load re-runs it, so admin toggles still show up
 * after a refresh, which is what the admin screen already told users to do.
 */
function loadPublicSettings(): Promise<PublicSettings> {
  inflight ??= fetch("/api/settings/public")
    .then((res) => (res.ok ? res.json() : FALLBACK))
    .then((data: PublicSettings) => ({
      acceptingOrders: data.acceptingOrders !== false,
      developmentNotice: data.developmentNotice === true,
    }))
    .catch(() => FALLBACK);
  return inflight;
}

/**
 * `null` while the request is in flight — deliberately distinct from the
 * FALLBACK a failed request resolves to, so callers can tell "not known yet"
 * apart from "could not be read". The footer renders nothing while loading and
 * the fail-safe pill once loaded, including on failure; the notice renders
 * nothing in either case, since its `=== true` guard hides it both ways.
 */
export function usePublicSettings(): PublicSettings | null {
  const [settings, setSettings] = useState<PublicSettings | null>(null);

  useEffect(() => {
    let active = true;
    loadPublicSettings().then((value) => {
      if (active) setSettings(value);
    });
    return () => {
      active = false;
    };
  }, []);

  return settings;
}
