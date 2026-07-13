"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const getServerSnapshot = () => null;

function getSnapshot(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

/** Read the browser timezone without making the server and hydration
 *  renders disagree. Timezones do not change during a page session, so
 *  this external store intentionally has no change notifications. */
export function useViewerTimeZone(): string | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
