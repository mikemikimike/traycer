import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `editor-lease.ts` caches its window token in a module-level variable, set
 * once on first use. A fresh module graph per test is what makes "this window"
 * vs "another window" a controllable, deterministic distinction instead of a
 * leak between cases.
 */
async function freshLease(): Promise<{
  lease: typeof import("@/lib/layout/editor-lease");
  store: typeof import("@/stores/layout/layout-editor-store").useLayoutEditorStore;
}> {
  vi.resetModules();
  const lease = await import("@/lib/layout/editor-lease");
  const { useLayoutEditorStore: store } =
    await import("@/stores/layout/layout-editor-store");
  return { lease, store };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("layout editor lease: acquire", () => {
  it("acquires a free lease and locks nobody out locally", async () => {
    const { lease, store } = await freshLease();
    lease.initializeLayoutEditorWindow("me");

    const acquired = lease.acquireLayoutEditorLease();

    expect(acquired).toBe(true);
    expect(store.getState().lockedBy).toBe("none");
    expect(lease.readLayoutEditorLease()).toEqual({
      token: "me",
      expiresAt: 6000,
    });
  });

  it("fails to acquire while another window's lease is still live", async () => {
    const { lease, store } = await freshLease();
    lease.initializeLayoutEditorWindow("me");
    localStorage.setItem(
      lease.LAYOUT_EDITOR_LEASE_KEY,
      JSON.stringify({ token: "other-window", expiresAt: 10_000 }),
    );

    const acquired = lease.acquireLayoutEditorLease();

    expect(acquired).toBe(false);
    expect(store.getState().lockedBy).toBe("other-window");
    // The other window's lease is untouched.
    expect(lease.readLayoutEditorLease()).toEqual({
      token: "other-window",
      expiresAt: 10_000,
    });
  });

  it("re-acquiring its own still-live lease succeeds (idempotent)", async () => {
    const { lease } = await freshLease();
    lease.initializeLayoutEditorWindow("me");
    lease.acquireLayoutEditorLease();

    expect(lease.acquireLayoutEditorLease()).toBe(true);
  });
});

describe("layout editor lease: expiry", () => {
  it("takes over a lease whose expiresAt is in the past", async () => {
    const { lease, store } = await freshLease();
    lease.initializeLayoutEditorWindow("me");
    localStorage.setItem(
      lease.LAYOUT_EDITOR_LEASE_KEY,
      JSON.stringify({ token: "crashed-window", expiresAt: -1 }),
    );

    const acquired = lease.acquireLayoutEditorLease();

    expect(acquired).toBe(true);
    expect(store.getState().lockedBy).toBe("none");
    expect(lease.readLayoutEditorLease()).toEqual({
      token: "me",
      expiresAt: 6000,
    });
  });

  it("refreshLayoutEditorLock reports free once the held lease's time has passed", async () => {
    const { lease, store } = await freshLease();
    lease.initializeLayoutEditorWindow("me");
    localStorage.setItem(
      lease.LAYOUT_EDITOR_LEASE_KEY,
      JSON.stringify({ token: "other-window", expiresAt: 5_000 }),
    );

    expect(lease.refreshLayoutEditorLock()).toBe(true);
    expect(store.getState().lockedBy).toBe("other-window");

    vi.setSystemTime(5_001);

    expect(lease.refreshLayoutEditorLock()).toBe(false);
    expect(store.getState().lockedBy).toBe("none");
  });

  it("ignores a malformed lease record instead of locking forever", async () => {
    const { lease } = await freshLease();
    localStorage.setItem(lease.LAYOUT_EDITOR_LEASE_KEY, "{not json");

    expect(lease.readLayoutEditorLease()).toBeNull();
    expect(lease.refreshLayoutEditorLock()).toBe(false);
  });
});

describe("layout editor lease: release", () => {
  it("release clears its own lease and unlocks locally", async () => {
    const { lease, store } = await freshLease();
    lease.initializeLayoutEditorWindow("me");
    lease.acquireLayoutEditorLease();

    lease.releaseLayoutEditorLease();

    expect(lease.readLayoutEditorLease()).toBeNull();
    expect(store.getState().lockedBy).toBe("none");
  });

  it("release is a no-op on a lease another window currently holds", async () => {
    const { lease } = await freshLease();
    lease.initializeLayoutEditorWindow("me");
    localStorage.setItem(
      lease.LAYOUT_EDITOR_LEASE_KEY,
      JSON.stringify({ token: "other-window", expiresAt: 10_000 }),
    );

    lease.releaseLayoutEditorLease();

    expect(lease.readLayoutEditorLease()).toEqual({
      token: "other-window",
      expiresAt: 10_000,
    });
  });
});
