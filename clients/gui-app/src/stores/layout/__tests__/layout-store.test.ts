import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONTEXT_USAGE_ROW_KEYS } from "@/components/chat/context-usage";
import {
  DEFAULT_ARRANGEMENT,
  leftPanelGroupsFromRail,
} from "@/lib/layout/layout-arrangement";
import {
  changeCount,
  changedKeys,
  regionChanged,
  resetEverything,
  resetToBase,
  revertKeys,
} from "@/lib/layout/layout-diff";
import {
  effectiveLayoutValues,
  PRESET_VALUES,
} from "@/lib/layout/layout-values";
import { persistKey, STORE_KEYS } from "@/lib/persist";
import {
  DEFAULT_LAYOUT_SNAPSHOT,
  getLayoutSnapshot,
  isHomeTabEnabled,
  useLayoutStore,
  type LayoutSnapshot,
} from "@/stores/layout/layout-store";

const LAYOUT_KEY = persistKey(STORE_KEYS.layout);
const LAYOUT_VERSION = 2;

function reset(): void {
  useLayoutStore.setState({
    ...DEFAULT_LAYOUT_SNAPSHOT,
    layoutCarryDone: false,
  });
  window.localStorage.clear();
}

function writeLayoutRecord(state: unknown): void {
  window.localStorage.setItem(
    LAYOUT_KEY,
    JSON.stringify({ state, version: LAYOUT_VERSION }),
  );
}

async function rehydrateFrom(state: unknown): Promise<void> {
  writeLayoutRecord(state);
  await useLayoutStore.persist.rehydrate();
}

/**
 * A second launch of the store, module load and all - the only way to observe
 * the carry, which runs before the store exists.
 */
async function relaunchStore(): Promise<{
  readonly state: () => LayoutSnapshot;
  readonly carried: () => boolean;
}> {
  vi.resetModules();
  const module = await import("@/stores/layout/layout-store");
  return {
    state: () => ({
      basePreset: module.useLayoutStore.getState().basePreset,
      overrides: module.useLayoutStore.getState().overrides,
      arrangement: module.useLayoutStore.getState().arrangement,
    }),
    carried: () => module.useLayoutStore.getState().layoutCarryDone,
  };
}

describe("useLayoutStore", () => {
  beforeEach(reset);
  afterEach(reset);

  it("starts on the Default preset with nothing overridden", () => {
    expect(getLayoutSnapshot()).toEqual(DEFAULT_LAYOUT_SNAPSHOT);
    expect(
      effectiveLayoutValues(
        DEFAULT_LAYOUT_SNAPSHOT.basePreset,
        DEFAULT_LAYOUT_SNAPSHOT.overrides,
      ),
    ).toEqual(PRESET_VALUES.default);
  });

  describe("the delta stays minimal", () => {
    it("writes only the key that differs from the base preset", () => {
      useLayoutStore.getState().setRegionValues("model", { style: "bars" });

      expect(getLayoutSnapshot().overrides).toEqual({
        model: { style: "bars" },
      });
      expect(
        effectiveLayoutValues("default", getLayoutSnapshot().overrides).model,
      ).toEqual({ shown: "shown", style: "bars" });
    });

    it("drops a key set back to what the base preset says", () => {
      const store = useLayoutStore.getState();
      store.setRegionValues("model", { style: "bars" });
      store.setRegionValues("model", { style: "text" });

      expect(getLayoutSnapshot().overrides).toEqual({});
    });

    it("drops a pinned-field list that matches the base, and keeps one that does not", () => {
      const store = useLayoutStore.getState();
      store.setRegionValues("contextUsage", {
        pinnedFields: [...CONTEXT_USAGE_ROW_KEYS],
      });

      // A fresh array with the same rows in the same order is not a change.
      expect(getLayoutSnapshot().overrides).toEqual({});

      store.setRegionValues("contextUsage", { pinnedFields: ["used"] });

      expect(getLayoutSnapshot().overrides).toEqual({
        contextUsage: { pinnedFields: ["used"] },
      });
    });
  });

  describe("the base preset", () => {
    it("keeps the arrangement and the changes that are still changes", () => {
      const store = useLayoutStore.getState();
      store.setArrangement({ ...DEFAULT_ARRANGEMENT, minimapSide: "left" });
      // Compact hides the microphone too, so this stops being a change.
      store.setRegionValues("mic", { shown: "hidden" });
      // Compact has no opinion about the Home tab, so this stays one.
      store.setRegionValues("homeTab", { shown: "shown" });

      useLayoutStore.getState().setBasePreset("compact");

      expect(getLayoutSnapshot().overrides).toEqual({
        homeTab: { shown: "shown" },
      });
      expect(getLayoutSnapshot().arrangement.minimapSide).toBe("left");
      expect(
        effectiveLayoutValues("compact", getLayoutSnapshot().overrides).mic,
      ).toEqual({ shown: "hidden" });
    });
  });

  describe("the arrangement", () => {
    it("repairs a drag that lands impossibly", () => {
      useLayoutStore.getState().setArrangement({
        ...DEFAULT_ARRANGEMENT,
        toolbarLeft: ["model", "attachImage"],
        toolbarRight: [],
      });

      const { arrangement } = getLayoutSnapshot();

      expect(arrangement.toolbarLeft).toEqual([
        "attachImage",
        "access",
        "agent",
      ]);
      expect(arrangement.toolbarRight).toEqual(["model", "mic"]);
    });
  });

  describe("counting and reverting", () => {
    it("counts values, reordered groups and hidden providers", () => {
      const store = useLayoutStore.getState();
      store.setRegionValues("model", { style: "bars" });
      store.setRegionValues("usageLimits", { bar: false, word: false });
      store.setArrangement({
        ...DEFAULT_ARRANGEMENT,
        dock: ["background", "changedFiles", "runningAgents"],
        hiddenProviders: ["codex"],
      });

      // Three values, one reordered group, one hidden provider.
      expect(changeCount(getLayoutSnapshot())).toBe(5);
    });

    it("names the changed keys of one region and leaves the others alone", () => {
      useLayoutStore
        .getState()
        .setRegionValues("usageLimits", { bar: false, word: false });
      const snapshot = getLayoutSnapshot();

      expect(changedKeys(snapshot, "usageLimits")).toEqual(["bar", "word"]);
      expect(regionChanged(snapshot, "usageLimits")).toBe(true);
      expect(regionChanged(snapshot, "model")).toBe(false);
    });

    it("reverts one row and keeps the rest of the region", () => {
      useLayoutStore
        .getState()
        .setRegionValues("usageLimits", { bar: false, word: false });

      const reverted = revertKeys(getLayoutSnapshot(), "usageLimits", ["bar"]);

      expect(reverted.overrides).toEqual({ usageLimits: { word: false } });
    });

    it("drops the region once its last changed key is reverted", () => {
      useLayoutStore.getState().setRegionValues("usageLimits", { bar: false });

      const reverted = revertKeys(getLayoutSnapshot(), "usageLimits", ["bar"]);

      expect(reverted.overrides).toEqual({});
    });
  });

  describe("the two resets", () => {
    it("puts the values back and leaves the arrangement where it is", () => {
      const store = useLayoutStore.getState();
      store.setRegionValues("model", { style: "bars" });
      store.setArrangement({ ...DEFAULT_ARRANGEMENT, usageHost: "header" });

      useLayoutStore.getState().replaceAll(resetToBase(getLayoutSnapshot()));

      expect(getLayoutSnapshot().overrides).toEqual({});
      expect(getLayoutSnapshot().arrangement.usageHost).toBe("header");
    });

    it("puts the whole page back, arrangement and preset included", () => {
      const store = useLayoutStore.getState();
      store.setBasePreset("detailed");
      store.setArrangement({ ...DEFAULT_ARRANGEMENT, usageHost: "header" });

      useLayoutStore.getState().replaceAll(resetEverything());

      expect(getLayoutSnapshot()).toEqual(DEFAULT_LAYOUT_SNAPSHOT);
    });
  });

  describe("rehydration", () => {
    it("drops a value this build has no case for, a region it does not know, and an override that agrees with the base", async () => {
      await rehydrateFrom({
        basePreset: "compact",
        overrides: {
          // Compact's own model style: not a change, so not an override.
          model: { style: "bars" },
          mic: { shown: "sideways" },
          nowhere: { shown: "hidden" },
          homeTab: { shown: "shown" },
        },
        arrangement: DEFAULT_ARRANGEMENT,
        layoutCarryDone: true,
      });

      expect(getLayoutSnapshot().basePreset).toBe("compact");
      expect(getLayoutSnapshot().overrides).toEqual({
        homeTab: { shown: "shown" },
      });
    });

    it("falls back to the defaults on a record it cannot read", async () => {
      await rehydrateFrom("not a layout record");

      expect(getLayoutSnapshot()).toEqual(DEFAULT_LAYOUT_SNAPSHOT);
    });

    it("takes another window's write through the storage event", async () => {
      writeLayoutRecord({
        basePreset: "detailed",
        overrides: { homeTab: { shown: "shown" } },
        arrangement: DEFAULT_ARRANGEMENT,
        layoutCarryDone: true,
      });

      window.dispatchEvent(new StorageEvent("storage", { key: LAYOUT_KEY }));
      await Promise.resolve();

      expect(getLayoutSnapshot().basePreset).toBe("detailed");
      expect(isHomeTabEnabled()).toBe(true);
    });
  });
});

describe("the one-shot carry of the four shipped values (L-49)", () => {
  beforeEach(reset);
  afterEach(reset);

  it("carries the minimap, the pinned breakdown, the resource switch and the rail", async () => {
    window.localStorage.setItem(
      persistKey(STORE_KEYS.settings),
      JSON.stringify({
        state: {
          chatTurnMinimapSide: "left",
          pinContextUsageBreakdown: true,
          pinnedContextBreakdownFields: ["output", "used"],
          pinnedContextBreakdownOrder: ["output", "used"],
          showGlobalResourceMonitor: false,
          // Everything else the settings record holds is deliberately not
          // carried: it never shipped as a layout value.
          contextIndicatorStyle: "ring",
          homeTabEnabled: true,
        },
        version: 1,
      }),
    );
    window.localStorage.setItem(
      persistKey(STORE_KEYS.leftPanel),
      JSON.stringify({
        // The whole grouping, which is the shape the sidebar store holds: a
        // panel it has no group for is its own group there.
        state: {
          panelGroups: [
            { panelIds: ["chats", "artifacts", "terminals"] },
            { panelIds: ["browsers"] },
            { panelIds: ["git-diff"] },
            { panelIds: ["pull-requests"] },
            { panelIds: ["file-tree"] },
            { panelIds: ["sharing"] },
            { panelIds: ["comments"] },
          ],
        },
        version: 3,
      }),
    );

    const relaunched = await relaunchStore();
    const { overrides, arrangement } = relaunched.state();

    expect(overrides).toEqual({
      contextUsage: { pinBreakdown: true, pinnedFields: ["used", "output"] },
      resourceMonitor: { shown: "hidden" },
    });
    expect(arrangement.minimapSide).toBe("left");
    expect(arrangement.pinnedContextFieldOrder).toEqual([
      "output",
      "used",
      "fresh",
      "cacheRead",
      "cacheWrite",
    ]);
    expect(leftPanelGroupsFromRail(arrangement.rail)).toEqual([
      { panelIds: ["chats", "artifacts", "terminals"] },
      { panelIds: ["browsers"] },
      { panelIds: ["git-diff"] },
      { panelIds: ["pull-requests"] },
      { panelIds: ["file-tree"] },
      { panelIds: ["sharing"] },
      { panelIds: ["comments"] },
    ]);
    expect(relaunched.carried()).toBe(true);
  });

  it("carries a hidden minimap as hidden, on the default side", async () => {
    window.localStorage.setItem(
      persistKey(STORE_KEYS.settings),
      JSON.stringify({
        state: { chatTurnMinimapSide: "hide" },
        version: 1,
      }),
    );

    const { state } = await relaunchStore();

    expect(state().overrides).toEqual({ minimap: { shown: "hidden" } });
    expect(state().arrangement.minimapSide).toBe(
      DEFAULT_ARRANGEMENT.minimapSide,
    );
  });

  it("never runs a second time, so a later relaunch keeps the user's own value", async () => {
    window.localStorage.setItem(
      persistKey(STORE_KEYS.settings),
      JSON.stringify({
        state: { showGlobalResourceMonitor: false },
        version: 1,
      }),
    );
    // The first launch carried the switch off; the user turned it back on,
    // which is what this record holds.
    writeLayoutRecord({
      basePreset: "default",
      overrides: {},
      arrangement: DEFAULT_ARRANGEMENT,
      layoutCarryDone: true,
    });

    const { state } = await relaunchStore();

    expect(state().overrides).toEqual({});
  });

  it("carries nothing from a record it cannot read", async () => {
    window.localStorage.setItem(persistKey(STORE_KEYS.settings), "{ broken");
    window.localStorage.setItem(persistKey(STORE_KEYS.leftPanel), "[]");

    const relaunched = await relaunchStore();

    expect(relaunched.state()).toEqual(DEFAULT_LAYOUT_SNAPSHOT);
    expect(relaunched.carried()).toBe(true);
  });
});
