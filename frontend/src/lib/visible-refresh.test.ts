import { afterEach, expect, it, vi } from "vitest";
import { startVisibleRefresh } from "./visible-refresh";

afterEach(() => vi.useRealTimers());

it("refreshes visible race-week pages, resumes once, and removes timers and listeners", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-06T12:00:00Z"));
  const visibility = Object.assign(new EventTarget(), { visibilityState: "visible" as DocumentVisibilityState });
  const refresh = vi.fn();
  const stop = startVisibleRefresh({ dateStart: "2026-09-06", dateEnd: "2026-09-06" }, refresh, visibility);
  vi.advanceTimersByTime(60_000);
  expect(refresh).toHaveBeenCalledTimes(1);
  visibility.visibilityState = "hidden";
  vi.advanceTimersByTime(180_000);
  expect(refresh).toHaveBeenCalledTimes(1);
  visibility.visibilityState = "visible";
  visibility.dispatchEvent(new Event("visibilitychange"));
  visibility.dispatchEvent(new Event("visibilitychange"));
  expect(refresh).toHaveBeenCalledTimes(2);
  vi.setSystemTime(new Date("2026-09-20T12:00:00Z"));
  vi.advanceTimersByTime(60_000);
  expect(refresh).toHaveBeenCalledTimes(2);
  stop();
  expect(vi.getTimerCount()).toBe(0);
  visibility.dispatchEvent(new Event("visibilitychange"));
  expect(refresh).toHaveBeenCalledTimes(2);
});
