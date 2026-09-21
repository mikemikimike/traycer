import { persistKey, STORE_KEYS } from "@/lib/persist";

/**
 * The once-per-24h-per-device gate for `layout_snapshot` (L-54, tech-plan
 * section 7): a synchronous read-compare-write against the `layout-snapshot`
 * leaf, run BEFORE the caller sends anything, so two renderers launching
 * together cannot both count the same device. A module-level flag (the way
 * `app_opened` guards itself) would be wrong here for that exact reason: two
 * windows are two renderers, and a flag lives per renderer.
 */

const LAYOUT_SNAPSHOT_KEY = persistKey(STORE_KEYS.layoutSnapshot);

const SNAPSHOT_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * `null` means "never sent on this device" - a distinct value from a real
 * timestamp, and deliberately not `0`: an epoch-zero sentinel would collapse
 * with a genuine `lastSnapshotAtMs` near the epoch, and it forces every
 * caller to reason in absolute wall-clock time rather than being free to
 * pass any clock (as the tests do).
 */
function readLastSnapshotAtMs(): number | null {
  try {
    const raw = localStorage.getItem(LAYOUT_SNAPSHOT_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object") return null;
    const value: unknown = Reflect.get(parsed, "lastSnapshotAtMs");
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * Claims this device's `layout_snapshot` window for `now`, or refuses.
 *
 * A storage failure on either side refuses rather than sends: the app must
 * never pay for telemetry, and sending on a write it cannot persist would
 * make every launch re-claim the same window instead of the one-per-24h this
 * exists to guarantee.
 */
export function claimLayoutSnapshotWindow(now: number): boolean {
  const lastSnapshotAtMs = readLastSnapshotAtMs();
  if (
    lastSnapshotAtMs !== null &&
    now - lastSnapshotAtMs < SNAPSHOT_INTERVAL_MS
  ) {
    return false;
  }
  try {
    localStorage.setItem(
      LAYOUT_SNAPSHOT_KEY,
      JSON.stringify({ lastSnapshotAtMs: now }),
    );
  } catch {
    return false;
  }
  return true;
}
