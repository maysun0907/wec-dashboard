import { isRaceWeek, type RaceWindow } from "./cache-policy";

/** Poll only visible pages during the active window; clean up on navigation. */
export function startVisibleRefresh(
  event: RaceWindow,
  refresh: () => void,
  visibility: Pick<Document, "visibilityState" | "addEventListener" | "removeEventListener">,
): () => void {
  let lastRefresh = Date.now();
  const tick = () => {
    const now = Date.now();
    if (visibility.visibilityState === "visible" && isRaceWeek(event, new Date(now))
      && now - lastRefresh >= 60_000) {
      lastRefresh = now;
      refresh();
    }
  };
  const timer = setInterval(tick, 60_000);
  visibility.addEventListener("visibilitychange", tick);
  return () => {
    clearInterval(timer);
    visibility.removeEventListener("visibilitychange", tick);
  };
}
