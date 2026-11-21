import { afterEach, expect, it, vi } from "vitest";
import { startVisibleRefresh } from "./visible-refresh";

afterEach(() => vi.useRealTimers());

it("polls visible race-week pages, resumes once, and removes timers and listeners", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-06T12:00:00Z"));
  const visibility = Object.assign(new EventTarget(), { visibilityState: "visible" as DocumentVisibilityState });
  const refresh = vi.fn(async () => {});
  const stop = startVisibleRefresh({ dateStart: "2026-09-06", dateEnd: "2026-09-06" }, refresh, visibility);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(refresh).toHaveBeenCalledTimes(1);
  visibility.visibilityState = "hidden";
  await vi.advanceTimersByTimeAsync(180_000);
  expect(refresh).toHaveBeenCalledTimes(1);
  visibility.visibilityState = "visible";
  visibility.dispatchEvent(new Event("visibilitychange"));
  visibility.dispatchEvent(new Event("visibilitychange"));
  expect(refresh).toHaveBeenCalledTimes(2);
  vi.setSystemTime(new Date("2026-09-20T12:00:00Z"));
  await vi.advanceTimersByTimeAsync(60_000);
  expect(refresh).toHaveBeenCalledTimes(2);
  stop();
  expect(vi.getTimerCount()).toBe(0);
  visibility.dispatchEvent(new Event("visibilitychange"));
  expect(refresh).toHaveBeenCalledTimes(2);
});

it("flags a clock-only transition, serializes requests and aborts on cleanup", async () => {
  vi.useFakeTimers();
  const now = new Date("2026-09-06T12:00:00Z");
  vi.setSystemTime(now);
  const visibility = Object.assign(new EventTarget(), { visibilityState: "visible" as const });
  const refresh = vi.fn<(signal: AbortSignal, boundary: boolean) => Promise<void>>(
    () => new Promise<void>(() => {}),
  );
  const stop = startVisibleRefresh({ dateStart: "2026-09-06", dateEnd: "2026-09-06" },
    refresh, visibility, now.getTime() + 50_000);
  await vi.advanceTimersByTimeAsync(180_000);
  expect(refresh).toHaveBeenCalledOnce();
  const [signal, boundary] = refresh.mock.calls[0]!;
  expect(boundary).toBe(true);
  stop();
  expect(signal.aborted).toBe(true);
});
