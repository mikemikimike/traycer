import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  SIDE_STRIP_DEFAULT_WIDTH_PX,
  SIDE_STRIP_MAX_WIDTH_PX,
  SIDE_STRIP_MIN_WIDTH_PX,
} from "@/components/layout/tabs/side-strip/side-strip-tokens";
import { persistKey, STORE_KEYS } from "@/lib/persist";
import {
  clampSideStripWidth,
  useSideTabStripStore,
} from "@/stores/layout/side-tab-strip-store";

const KEY = persistKey(STORE_KEYS.sideTabStrip);

function writeRecord(state: unknown): void {
  window.localStorage.setItem(KEY, JSON.stringify({ state, version: 1 }));
}

function snapshot(): { widthPx: number; collapsed: boolean } {
  const { widthPx, collapsed } = useSideTabStripStore.getState();
  return { widthPx, collapsed };
}

beforeEach(() => {
  window.localStorage.clear();
  useSideTabStripStore.setState({
    widthPx: SIDE_STRIP_DEFAULT_WIDTH_PX,
    collapsed: false,
  });
});

afterEach(() => {
  window.localStorage.clear();
});

describe("clampSideStripWidth", () => {
  it("keeps a width inside the range", () => {
    expect(clampSideStripWidth(300)).toBe(300);
  });

  it("clamps to the minimum and the maximum", () => {
    expect(clampSideStripWidth(10)).toBe(SIDE_STRIP_MIN_WIDTH_PX);
    expect(clampSideStripWidth(5000)).toBe(SIDE_STRIP_MAX_WIDTH_PX);
  });

  it("resolves a non-finite width to the default", () => {
    expect(clampSideStripWidth(Number.NaN)).toBe(SIDE_STRIP_DEFAULT_WIDTH_PX);
    expect(clampSideStripWidth(Number.POSITIVE_INFINITY)).toBe(
      SIDE_STRIP_DEFAULT_WIDTH_PX,
    );
  });
});

describe("writes", () => {
  it("clamps setWidthPx", () => {
    useSideTabStripStore.getState().setWidthPx(100);
    expect(useSideTabStripStore.getState().widthPx).toBe(
      SIDE_STRIP_MIN_WIDTH_PX,
    );
    useSideTabStripStore.getState().setWidthPx(900);
    expect(useSideTabStripStore.getState().widthPx).toBe(
      SIDE_STRIP_MAX_WIDTH_PX,
    );
  });

  it("persists width and collapsed state", () => {
    useSideTabStripStore.getState().setWidthPx(320);
    useSideTabStripStore.getState().setCollapsed(true);
    const stored: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? "");
    expect(stored).toMatchObject({ state: { widthPx: 320, collapsed: true } });
  });

  it("resetWidth returns to the default", () => {
    useSideTabStripStore.getState().setWidthPx(360);
    useSideTabStripStore.getState().resetWidth();
    expect(useSideTabStripStore.getState().widthPx).toBe(
      SIDE_STRIP_DEFAULT_WIDTH_PX,
    );
  });
});

describe("rehydrate", () => {
  it("clamps an out-of-range persisted width", async () => {
    writeRecord({ widthPx: 1200, collapsed: true });
    await useSideTabStripStore.persist.rehydrate();
    expect(snapshot()).toEqual({
      widthPx: SIDE_STRIP_MAX_WIDTH_PX,
      collapsed: true,
    });
  });

  it("resolves a junk record to the defaults", async () => {
    useSideTabStripStore.setState({ widthPx: 300, collapsed: true });
    writeRecord({ widthPx: "wide", collapsed: "yes" });
    await useSideTabStripStore.persist.rehydrate();
    expect(snapshot()).toEqual({
      widthPx: SIDE_STRIP_DEFAULT_WIDTH_PX,
      collapsed: false,
    });
  });

  it("resolves a non-object record to the defaults", async () => {
    useSideTabStripStore.setState({ widthPx: 300, collapsed: true });
    writeRecord("junk");
    await useSideTabStripStore.persist.rehydrate();
    expect(snapshot()).toEqual({
      widthPx: SIDE_STRIP_DEFAULT_WIDTH_PX,
      collapsed: false,
    });
  });

  it("picks up another window's write from a storage event", async () => {
    writeRecord({ widthPx: 280, collapsed: true });
    window.dispatchEvent(new StorageEvent("storage", { key: KEY }));
    await expect
      .poll(() => snapshot())
      .toEqual({ widthPx: 280, collapsed: true });
  });

  it("ignores a storage event for another key", async () => {
    writeRecord({ widthPx: 280, collapsed: true });
    window.dispatchEvent(
      new StorageEvent("storage", { key: persistKey(STORE_KEYS.layout) }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(snapshot()).toEqual({
      widthPx: SIDE_STRIP_DEFAULT_WIDTH_PX,
      collapsed: false,
    });
  });
});
