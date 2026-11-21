import { isRaceWeek, type RaceWindow } from "./cache-policy";

/** Poll only visible pages during the active window; clean up on navigation. */
export function startVisibleRefresh(
  event: RaceWindow,
  refresh: (signal: AbortSignal, crossedBoundary: boolean) => Promise<void>,
  visibility: Pick<Document, "visibilityState" | "addEventListener" | "removeEventListener">,
  refreshAt?: number,
): () => void {
  const controller = new AbortController();
  const mountedAt = Date.now();
  let lastPoll = refreshAt !== undefined && refreshAt <= mountedAt ? mountedAt - 60_000 : mountedAt;
  let busy = false;
  const tick = () => {
    const now = Date.now();
    if (busy || controller.signal.aborted || visibility.visibilityState !== "visible") return;
    const crossedBoundary = refreshAt !== undefined && now >= refreshAt;
    if (now - lastPoll < 60_000 || !isRaceWeek(event, new Date(now))) return;
    lastPoll = now;
    busy = true;
    void refresh(controller.signal, crossedBoundary).catch(() => {
      // A failed observation is not evidence of new data.
    }).finally(() => { busy = false; });
  };
  const timer = setInterval(tick, 60_000);
  visibility.addEventListener("visibilitychange", tick);
  // A cached page can be opened just after a session boundary.
  tick();
  return () => {
    controller.abort();
    clearInterval(timer);
    visibility.removeEventListener("visibilitychange", tick);
  };
}
