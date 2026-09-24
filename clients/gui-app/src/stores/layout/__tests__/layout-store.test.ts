import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONTEXT_USAGE_ROW_KEYS } from "@/lib/context-usage-rows";
import { DEFAULT_ARRANGEMENT } from "@/lib/layout/layout-arrangement";
import { visibleRailPanelIds, type RailEntry } from "@/lib/layout/rail";
import type { RailRegionId } from "@/lib/layout/region-id";
import {
  changeCount,
  regionChanged,
  resetToBase,
} from "@/lib/layout/layout-diff";
import { type LayoutValues } from "@/lib/layout/layout-values";
import {
  effectiveLayoutValues,
  PRESET_VALUES,
} from "@/lib/layout/layout-presets";
import { persistKey, STORE_KEYS } from "@/lib/persist";
import type { LayoutSnapshot } from "@/lib/layout/layout-snapshot";
import {
  DEFAULT_LAYOUT_SNAPSHOT,
  getLayoutSnapshot,
  isHomeTabEnabled,
  useLayoutStore,
} from "@/stores/layout/layout-store";

const LAYOUT_KEY = persistKey(STORE_KEYS.layout);
const LAYOUT_VERSION = 4;

/** Every panel the rail holds, hiding nothing. */
function everyRailPanelId(
  rail: ReadonlyArray<RailEntry>,
): ReadonlyArray<string> {
  return visibleRailPanelIds(rail, () => true);
}

function reset(): void {
  useLayoutStore.setState({
    ...DEFAULT_LAYOUT_SNAPSHOT,
    layoutCarryDone: false,
  });
  window.localStorage.clear();
}

function writeLayoutRecord(state: unknown): void {
  writeLayoutRecordAtVersion(state, LAYOUT_VERSION);
}

function writeLayoutRecordAtVersion(state: unknown, version: number): void {
  window.localStorage.setItem(LAYOUT_KEY, JSON.stringify({ state, version }));
}

async function rehydrateFrom(state: unknown): Promise<void> {
  writeLayoutRecord(state);
  await useLayoutStore.persist.rehydrate();
}

/** The same, from a record written before the version this build writes. */
async function rehydrateFromVersion(
  state: unknown,
  version: number,
): Promise<void> {
  writeLayoutRecordAtVersion(state, version);
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

/** A v1.3.0 machine's two legacy records, holding all five shipped values. */
function seedLegacyRecords(): void {
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
      // panel it has no group for is its own group there. Deliberately NOT
      // the canonical order, so the carry's one job - keeping the order the
      // user put the panels in - is observable.
      state: {
        panelGroups: [
          { panelIds: ["comments", "chats"] },
          { panelIds: ["artifacts", "terminals"] },
          { panelIds: ["browsers"] },
          { panelIds: ["git-diff"] },
          { panelIds: ["pull-requests"] },
          { panelIds: ["file-tree"] },
          { panelIds: ["sharing"] },
        ],
        // The fifth shipped key (L-61). `true` and `false` are both real
        // preferences; a panel absent from this map is on its own presence
        // rule and must carry nothing, and a non-boolean is not a preference.
        panelVisibilityOverrideById: {
          comments: false,
          sharing: true,
          "git-diff": "yes",
        },
      },
      // An OLDER version than this build's, which is what a machine updating
      // from v1.3.0 has - and what makes zustand rewrite the record through
      // the current `partialize` the moment the sidebar store is created.
      version: 2,
    }),
  );
}

/** What {@link seedLegacyRecords} must produce, all five keys at once. */
function expectCarried(snapshot: LayoutSnapshot, label: string): void {
  expect(snapshot.overrides, label).toEqual({
    contextUsage: { pinBreakdown: true, pinnedFields: ["used", "output"] },
    resourceMonitor: { shown: "hidden", agentRows: false },
    railComments: { shown: "hidden" },
    railSharing: { shown: "shown" },
  });
  expect(snapshot.arrangement.minimapSide, label).toBe("left");
  expect(snapshot.arrangement.pinnedContextFieldOrder, label).toEqual([
    "output",
    "used",
    "fresh",
    "cacheRead",
    "cacheWrite",
  ]);
  // The ORDER carries and the boundaries do not (L-155): the shipped sidebar
  // put one between every panel, which was structure rather than a preference.
  expect(everyRailPanelId(snapshot.arrangement.rail), label).toEqual([
    "comments",
    "chats",
    "artifacts",
    "terminals",
    "browsers",
    "git-diff",
    "pull-requests",
    "file-tree",
    "sharing",
  ]);
  expect(
    snapshot.arrangement.rail.filter((entry) => entry.kind === "divider"),
    label,
  ).toEqual([]);
  // A shipped group of two adjacent panels was two panels the sidebar drew
  // TOGETHER, which is a stack (L-166); a group of one was every lone panel,
  // which was structure. Both of this record's pairs carry, and nothing else
  // does.
  expect(
    snapshot.arrangement.rail.filter((entry) => entry.kind === "stack"),
    label,
  ).toEqual([
    { kind: "stack", id: "stack:railComments+railAgents" },
    { kind: "stack", id: "stack:railArtifacts+railTerminals" },
  ]);
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

  /**
   * The delta is what a person PICKED, and "changed" is measured against
   * whichever base is current (L-133). The two were the same thing while the
   * store re-minimized on every write - and keeping them the same cost a
   * preset click every pick the incoming preset happened to agree with.
   */
  describe("the delta is the user's picks", () => {
    it("writes only the key the caller named", () => {
      useLayoutStore.getState().setRegionValues("model", { style: "bars" });

      expect(getLayoutSnapshot().overrides).toEqual({
        model: { style: "bars" },
      });
      expect(
        effectiveLayoutValues("default", getLayoutSnapshot().overrides).model,
      ).toEqual({ style: "bars" });
    });

    it("keeps a key set back to the base's own value, and stops counting it", () => {
      const store = useLayoutStore.getState();
      store.setRegionValues("model", { style: "bars" });
      store.setRegionValues("model", { style: "text" });

      // The pick is on record - Compact draws this region as bars, so it is
      // the user's answer again the moment they switch density.
      expect(getLayoutSnapshot().overrides).toEqual({
        model: { style: "text" },
      });
      // ... and it is NOT a change, because nothing about the picture differs
      // from the base. That is the half the header, the dot and the revert
      // read, and it is measured rather than stored.
      expect(regionChanged(getLayoutSnapshot(), "model")).toBe(false);
      expect(changeCount(getLayoutSnapshot())).toBe(0);
    });

    it("counts a pinned-field list by its rows, not by its identity", () => {
      const store = useLayoutStore.getState();
      store.setRegionValues("contextUsage", {
        pinnedFields: [...CONTEXT_USAGE_ROW_KEYS],
      });

      // A fresh array with the same rows in the same order is not a change.
      expect(changeCount(getLayoutSnapshot())).toBe(0);

      store.setRegionValues("contextUsage", { pinnedFields: ["used"] });

      expect(getLayoutSnapshot().overrides).toEqual({
        contextUsage: { pinnedFields: ["used"] },
      });
      expect(changeCount(getLayoutSnapshot())).toBe(1);
    });
  });

  describe("the base preset (L-133)", () => {
    it("changes the density and keeps every pick, in both directions", () => {
      const store = useLayoutStore.getState();
      store.setArrangement({ ...DEFAULT_ARRANGEMENT, minimapSide: "left" });
      // Compact hides the microphone too, so this stops being a CHANGE there.
      store.setRegionValues("mic", { shown: "hidden" });
      // Compact has no opinion about the Home tab, so this stays one.
      store.setRegionValues("homeTab", { shown: "shown" });

      useLayoutStore.getState().setBasePreset("compact");

      expect(getLayoutSnapshot().overrides).toEqual({
        mic: { shown: "hidden" },
        homeTab: { shown: "shown" },
      });
      // Truthful without being lossy: one of the two picks differs from
      // Compact, so the header reads "Compact + 1 change".
      expect(changeCount(getLayoutSnapshot())).toBe(1);
      expect(getLayoutSnapshot().arrangement.minimapSide).toBe("left");
      expect(
        effectiveLayoutValues("compact", getLayoutSnapshot().overrides).mic,
      ).toEqual({ shown: "hidden" });

      // And the round trip, which is the whole of what L-133 bought: under
      // Detailed the mic is shown by the preset, so the pick becomes a change
      // again - the count is re-measured against the base that is current, not
      // carried over - and going back to Compact returns the user's own answer
      // instead of the preset's.
      useLayoutStore.getState().setBasePreset("detailed");
      expect(changeCount(getLayoutSnapshot())).toBe(2);
      useLayoutStore.getState().setBasePreset("compact");
      expect(
        effectiveLayoutValues("compact", getLayoutSnapshot().overrides).mic,
      ).toEqual({ shown: "hidden" });
    });

    it("is what `Reset to <preset>` is for, and that still clears them", () => {
      const store = useLayoutStore.getState();
      store.setRegionValues("homeTab", { shown: "shown" });
      store.setBasePreset("compact");

      useLayoutStore.getState().replaceAll(resetToBase(getLayoutSnapshot()));

      expect(getLayoutSnapshot().overrides).toEqual({});
      expect(getLayoutSnapshot().basePreset).toBe("compact");
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

      expect(arrangement.toolbarLeft).toEqual(["attachImage", "access"]);
      expect(arrangement.toolbarRight).toEqual(["model", "mic"]);
    });
  });

  describe("counting", () => {
    it("counts VALUES only, never the arrangement (L-57)", () => {
      const store = useLayoutStore.getState();
      store.setRegionValues("model", { style: "bars" });
      store.setRegionValues("usageLimits", { bar: false, word: false });
      store.setArrangement({
        ...DEFAULT_ARRANGEMENT,
        dock: ["background", "changedFiles", "runningAgents"],
        hiddenProviders: ["codex"],
      });

      // Three values. The reorder and the hidden provider are POSITION, which
      // the header's count deliberately leaves to the per-row dots.
      expect(changeCount(getLayoutSnapshot())).toBe(3);
    });

    it("marks the changed region and leaves the others alone", () => {
      useLayoutStore
        .getState()
        .setRegionValues("usageLimits", { bar: false, word: false });
      const snapshot = getLayoutSnapshot();

      expect(regionChanged(snapshot, "usageLimits")).toBe(true);
      expect(regionChanged(snapshot, "model")).toBe(false);
    });
  });

  describe("reset to base", () => {
    it("puts the values back and leaves the arrangement where it is", () => {
      const store = useLayoutStore.getState();
      store.setRegionValues("model", { style: "bars" });
      store.setArrangement({ ...DEFAULT_ARRANGEMENT, usageHost: "header" });

      useLayoutStore.getState().replaceAll(resetToBase(getLayoutSnapshot()));

      expect(getLayoutSnapshot().overrides).toEqual({});
      expect(getLayoutSnapshot().arrangement.usageHost).toBe("header");
    });
  });

  describe("the write path parses like a rehydrate (G1-08)", () => {
    it("refuses a value this build has no case for", () => {
      // The registry's control seam writes by a dynamic key, so a typo reaches
      // the store as a real patch. It has to die here rather than render from
      // a default branch for a session and vanish on the next launch.
      const patch: Partial<LayoutValues["mic"]> = {};
      Reflect.set(patch, "shown", "sideways");
      useLayoutStore.getState().setRegionValues("mic", patch);

      expect(getLayoutSnapshot().overrides).toEqual({});
    });

    it("applies several regions as ONE notification, so one undo step", () => {
      let notifications = 0;
      const unsubscribe = useLayoutStore.subscribe(() => {
        notifications += 1;
      });
      useLayoutStore.getState().setRegionValuesMany({
        model: { style: "bars" },
        homeTab: { shown: "shown" },
      });
      unsubscribe();

      expect(notifications).toBe(1);
      expect(getLayoutSnapshot().overrides).toEqual({
        model: { style: "bars" },
        homeTab: { shown: "shown" },
      });
    });
  });

  describe("rehydration", () => {
    it("drops a value this build has no case for and a region it does not know, and keeps a pick the base already makes", async () => {
      await rehydrateFrom({
        basePreset: "compact",
        overrides: {
          // Compact's own model style. Kept, because it is still a pick -
          // and it costs nothing, since nothing measures presence (L-133).
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
        model: { style: "bars" },
        homeTab: { shown: "shown" },
      });
      expect(changeCount(getLayoutSnapshot())).toBe(1);
    });

    /**
     * The retired region, end to end through the real persist path (L-136).
     * The values table and `TOOLBAR_REGION_IDS` both name this build's regions
     * only, so a blob written while `agent` existed rehydrates without a
     * migration, a discard pass or an error - and without leaving a change the
     * user cannot see or revert.
     */
    it("ignores a stored override and toolbar entry for a region this build retired", async () => {
      await rehydrateFrom({
        basePreset: "default",
        overrides: {
          agent: { shown: "hidden" },
          homeTab: { shown: "shown" },
        },
        arrangement: {
          ...DEFAULT_ARRANGEMENT,
          toolbarLeft: ["attachImage", "access", "agent"],
        },
        layoutCarryDone: true,
      });

      expect(getLayoutSnapshot().overrides).toEqual({
        homeTab: { shown: "shown" },
      });
      expect(getLayoutSnapshot().arrangement.toolbarLeft).toEqual([
        "attachImage",
        "access",
      ]);
      expect(changeCount(getLayoutSnapshot())).toBe(1);
    });

    /**
     * The whole of L-142's durability story, end to end through the real
     * persist path: a record written before Todo was a dock member carries a
     * three-entry dock and no value bag for it, and this build has to reach
     * four members with Todo leading the frame - where `ChatLowerDock`
     * already draws it - on its preset's own defaults. No migration, no
     * version bump, nothing to revert (P5).
     *
     * The Hidden-with-a-size half is the part a `shown`-only read would lose:
     * a member switched off keeps the size it would come back at, so turning
     * it on again returns the layout the user left rather than a full row
     * they never asked for.
     */
    it("materialises the new dock members a stored record predates, sizes intact", async () => {
      await rehydrateFrom({
        basePreset: "default",
        overrides: { todo: { shown: "hidden", size: "chip" } },
        arrangement: {
          ...DEFAULT_ARRANGEMENT,
          dock: ["changedFiles", "runningAgents", "background"],
        },
        layoutCarryDone: true,
      });

      const snapshot = getLayoutSnapshot();
      expect(snapshot.arrangement.dock).toEqual([
        "todo",
        "changedFiles",
        "runningAgents",
        "background",
      ]);
      const values = effectiveLayoutValues(
        snapshot.basePreset,
        snapshot.overrides,
      );
      expect(values.todo).toEqual({ shown: "hidden", size: "chip" });
    });

    /**
     * G1-G2: the Message queue was a dock region for a while and stopped
     * being one. A record written during that window carries a `queue` value
     * bag and a `queue` entry in the stored dock order, and this build reads
     * neither back - `resolvePersistedOverrides` no longer has a `queue` key
     * to fill, and `mergeOrder` drops an id the canonical dock order does not
     * name. No migration, nothing to revert (P5): the stale bytes are simply
     * never read again.
     */
    it("drops a stale queue value bag and dock entry on rehydrate", async () => {
      await rehydrateFrom({
        basePreset: "default",
        overrides: { queue: { shown: "hidden", size: "chip" } },
        arrangement: {
          ...DEFAULT_ARRANGEMENT,
          dock: [
            "queue",
            "todo",
            "changedFiles",
            "runningAgents",
            "background",
          ],
        },
        layoutCarryDone: true,
      });

      const snapshot = getLayoutSnapshot();
      expect(snapshot.overrides).not.toHaveProperty("queue");
      expect(snapshot.arrangement.dock).toEqual([
        "todo",
        "changedFiles",
        "runningAgents",
        "background",
      ]);
    });

    it("falls back to the defaults on a record it cannot read", async () => {
      await rehydrateFrom("not a layout record");

      expect(getLayoutSnapshot()).toEqual(DEFAULT_LAYOUT_SNAPSHOT);
    });

    /**
     * The tab strip placement and the sidebar side are new fields on an
     * unchanged version: `merge` resolves every field against its default
     * through `resolvePersistedArrangement`, so a v4 record written before
     * they existed rehydrates with both defaults rather than losing the rest
     * of the record to a version bump.
     */
    it("rehydrates a v4 record without the placement fields as top and left, merged field by field", async () => {
      // `usageHost: "header"` is a non-default field IN THE SAME RECORD: it
      // has to survive next to the two defaulted fields, which a version bump
      // that discarded the record (or ran a migration over it) would also
      // pass for `tabStripPlacement`/`sidebarSide` alone, since both would
      // read back as their defaults either way.
      const arrangementWithoutPlacement: Record<string, unknown> = {
        ...DEFAULT_ARRANGEMENT,
        usageHost: "header",
      };
      delete arrangementWithoutPlacement.tabStripPlacement;
      delete arrangementWithoutPlacement.sidebarSide;

      writeLayoutRecordAtVersion(
        {
          basePreset: "default",
          overrides: {},
          arrangement: arrangementWithoutPlacement,
          layoutCarryDone: true,
        },
        LAYOUT_VERSION,
      );
      await useLayoutStore.persist.rehydrate();

      const arrangement = getLayoutSnapshot().arrangement;
      expect(arrangement.tabStripPlacement).toBe("top");
      expect(arrangement.sidebarSide).toBe("left");
      expect(arrangement.usageHost).toBe("header");
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

describe("the one-shot carry of the five shipped values (L-49, L-61)", () => {
  beforeEach(reset);
  afterEach(reset);

  it("carries the minimap, the pinned breakdown, the resource switch, the rail and the per-panel Hide/Show", async () => {
    seedLegacyRecords();

    const relaunched = await relaunchStore();

    expectCarried(relaunched.state(), "relaunch");
    expect(relaunched.carried()).toBe(true);
  });

  it("carries all five whichever store module the entry path loads first (L-61)", async () => {
    // The order dependence this pins is not hypothetical. A zustand store
    // rewrites its own record through the CURRENT `partialize` on its first
    // write, and both legacy record owners have since dropped the fields the
    // carry reads. They reach that write differently, and this exercises
    // both: the sidebar store's record is an older version, so the migration
    // its `create()` runs writes it back; the settings record is current, so
    // it takes an ordinary `setState` - what any launch does within seconds
    // of start-up - to erase the three keys there.
    for (const order of ["layout-first", "owners-first"] as const) {
      reset();
      seedLegacyRecords();
      vi.resetModules();
      if (order === "owners-first") {
        const settings = await import("@/stores/settings/settings-store");
        settings.useSettingsStore.setState({});
        await import("@/stores/epics/left-panel-store");
      }
      const module = await import("@/stores/layout/layout-store");
      const state = module.useLayoutStore.getState();

      expectCarried(
        {
          basePreset: state.basePreset,
          overrides: state.overrides,
          arrangement: state.arrangement,
        },
        order,
      );
    }
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

  it("carries nothing from a legacy record sitting on the shipped defaults", async () => {
    // The carry runs for EVERY user on the first launch after it lands, not
    // only for users who changed something. Under L-133 the delta is the
    // user's own answers and nothing re-minimizes it, so a value equal to the
    // shipped Default must not be recorded: it would win over a preset click
    // forever and read as "Detailed + 1 change" on a layout nobody touched.
    window.localStorage.setItem(
      persistKey(STORE_KEYS.settings),
      JSON.stringify({
        state: {
          chatTurnMinimapSide: DEFAULT_ARRANGEMENT.minimapSide,
          pinContextUsageBreakdown:
            PRESET_VALUES.default.contextUsage.pinBreakdown,
          pinnedContextBreakdownFields: [...CONTEXT_USAGE_ROW_KEYS],
          showGlobalResourceMonitor: true,
        },
        version: 1,
      }),
    );

    const relaunched = await relaunchStore();

    expect(relaunched.state().overrides).toEqual({});
    expect(relaunched.carried()).toBe(true);
  });

  it("carries only the context-usage key that differs", async () => {
    window.localStorage.setItem(
      persistKey(STORE_KEYS.settings),
      JSON.stringify({
        state: {
          pinContextUsageBreakdown: true,
          // Equal to the Default's own list, so this half is not an answer.
          pinnedContextBreakdownFields: [...CONTEXT_USAGE_ROW_KEYS],
        },
        version: 1,
      }),
    );

    const { state } = await relaunchStore();

    expect(state().overrides).toEqual({ contextUsage: { pinBreakdown: true } });
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

/**
 * The record a dogfooder already has (L-158, L-166).
 *
 * The one-shot carry above only runs for a machine that has NO layout record,
 * so it cannot reach anyone who opened this branch before L-155: their rail
 * holds the seven dividers the shipped default put between every panel, which
 * is structure this build no longer has rather than spacers they placed - and
 * then, after L-155 and before L-166, no stack at all, because stacks did not
 * exist in that window.
 */
describe("the version-3 migration off the shipped dividers (L-158)", () => {
  beforeEach(reset);
  afterEach(reset);

  /** The pre-L-155 default, panel by panel with a divider between each. */
  function shippedRailWithDividers(): ReadonlyArray<RailEntry> {
    const panels: ReadonlyArray<RailEntry> = [
      { kind: "panel", id: "railAgents" },
      { kind: "panel", id: "railArtifacts" },
      { kind: "panel", id: "railTerminals" },
      { kind: "panel", id: "railBrowsers" },
      { kind: "panel", id: "railGitDiff" },
      { kind: "panel", id: "railPullRequests" },
      { kind: "panel", id: "railFileTree" },
      { kind: "panel", id: "railSharing" },
      { kind: "panel", id: "railComments" },
    ];
    return panels.flatMap((entry, index): RailEntry[] =>
      index === 0
        ? [entry]
        : [{ kind: "divider", id: `divider:${String(index)}` }, entry],
    );
  }

  it("drops every divider and keeps the user's panel order", async () => {
    // Deliberately NOT the canonical order: what the migration must keep is
    // the order this user put the panels in.
    const stored = shippedRailWithDividers().filter(
      (entry) => !(entry.kind === "panel" && entry.id === "railComments"),
    );
    await rehydrateFromVersion(
      {
        basePreset: "default",
        overrides: {},
        arrangement: {
          ...DEFAULT_ARRANGEMENT,
          rail: [{ kind: "panel", id: "railComments" }, ...stored],
          dividerSeq: 8,
        },
        layoutCarryDone: true,
      },
      2,
    );

    const rail = useLayoutStore.getState().arrangement.rail;
    expect(rail.filter((entry) => entry.kind === "divider")).toEqual([]);
    expect(everyRailPanelId(rail)).toEqual([
      "comments",
      "chats",
      "artifacts",
      "terminals",
      "browsers",
      "git-diff",
      "pull-requests",
      "file-tree",
      "sharing",
    ]);
  });

  it("leaves `dividerSeq` alone, so no removed id is ever reissued", async () => {
    await rehydrateFromVersion(
      {
        basePreset: "default",
        overrides: {},
        arrangement: {
          ...DEFAULT_ARRANGEMENT,
          rail: shippedRailWithDividers(),
          dividerSeq: 8,
        },
        layoutCarryDone: true,
      },
      2,
    );

    expect(useLayoutStore.getState().arrangement.dividerSeq).toBe(8);
  });

  it("keeps a divider in a record this build already wrote", async () => {
    // Version 4 is this build's own shape: a divider in it is one the user
    // placed, and the migration must not reach it.
    writeLayoutRecordAtVersion(
      {
        basePreset: "default",
        overrides: {},
        arrangement: {
          ...DEFAULT_ARRANGEMENT,
          rail: [
            { kind: "panel", id: "railAgents" },
            { kind: "divider", id: "divider:1" },
            ...DEFAULT_ARRANGEMENT.rail.slice(1),
          ],
          dividerSeq: 1,
        },
        layoutCarryDone: true,
      },
      4,
    );
    await useLayoutStore.persist.rehydrate();

    expect(
      useLayoutStore
        .getState()
        .arrangement.rail.filter((entry) => entry.kind === "divider"),
    ).toEqual([{ kind: "divider", id: "divider:1" }]);
  });
});

/**
 * The same record one ruling later (L-166).
 *
 * Stacking did not exist between L-155 and L-166, so a version-3 record names
 * no stack and nothing in it distinguishes "I never had one" from "I moved
 * those two apart". What it DOES say is whether the default pair is still
 * adjacent, and that is the whole of the rule.
 */
describe("the version-4 migration back onto the default stack (L-166)", () => {
  beforeEach(reset);
  afterEach(reset);

  /** The nine panels in some order, with no link and no divider. */
  function flatRail(
    order: ReadonlyArray<RailRegionId>,
  ): ReadonlyArray<RailEntry> {
    return order.map((id): RailEntry => ({ kind: "panel", id }));
  }

  async function rehydrateV3Rail(
    rail: ReadonlyArray<RailEntry>,
  ): Promise<void> {
    await rehydrateFromVersion(
      {
        basePreset: "default",
        overrides: {},
        arrangement: { ...DEFAULT_ARRANGEMENT, rail },
        layoutCarryDone: true,
      },
      3,
    );
  }

  it("gives the default stack to a rail whose default pair is still adjacent", async () => {
    await rehydrateV3Rail(
      flatRail([
        "railAgents",
        "railArtifacts",
        "railTerminals",
        "railBrowsers",
        "railGitDiff",
        "railPullRequests",
        "railFileTree",
        "railSharing",
        "railComments",
      ]),
    );

    expect(
      useLayoutStore
        .getState()
        .arrangement.rail.filter((entry) => entry.kind === "stack"),
    ).toEqual([{ kind: "stack", id: "stack:railAgents+railArtifacts" }]);
  });

  it("gives none to a rail where the user moved one of the two", async () => {
    await rehydrateV3Rail(
      flatRail([
        "railAgents",
        "railTerminals",
        "railArtifacts",
        "railBrowsers",
        "railGitDiff",
        "railPullRequests",
        "railFileTree",
        "railSharing",
        "railComments",
      ]),
    );

    const rail = useLayoutStore.getState().arrangement.rail;
    expect(rail.filter((entry) => entry.kind === "stack")).toEqual([]);
    expect(everyRailPanelId(rail)).toEqual([
      "chats",
      "terminals",
      "artifacts",
      "browsers",
      "git-diff",
      "pull-requests",
      "file-tree",
      "sharing",
      "comments",
    ]);
  });

  it("gives none when a divider the user placed sits between them", async () => {
    await rehydrateV3Rail([
      { kind: "panel", id: "railAgents" },
      { kind: "divider", id: "divider:1" },
      ...flatRail([
        "railArtifacts",
        "railTerminals",
        "railBrowsers",
        "railGitDiff",
        "railPullRequests",
        "railFileTree",
        "railSharing",
        "railComments",
      ]),
    ]);

    const rail = useLayoutStore.getState().arrangement.rail;
    expect(rail.filter((entry) => entry.kind === "stack")).toEqual([]);
    expect(rail.filter((entry) => entry.kind === "divider")).toEqual([
      { kind: "divider", id: "divider:1" },
    ]);
  });
});

describe("the version-5 migration splitting the agent rows off Shown (G7)", () => {
  beforeEach(reset);
  afterEach(reset);

  it("gives a hidden-monitor v4 record agentRows: false", async () => {
    await rehydrateFromVersion(
      {
        basePreset: "default",
        overrides: { resourceMonitor: { shown: "hidden" } },
        arrangement: DEFAULT_ARRANGEMENT,
        layoutCarryDone: true,
      },
      4,
    );

    expect(getLayoutSnapshot().overrides.resourceMonitor).toEqual({
      shown: "hidden",
      agentRows: false,
    });
  });

  it("forces nothing when the monitor is shown - agentRows stays the shipped default", async () => {
    await rehydrateFromVersion(
      {
        basePreset: "default",
        overrides: { resourceMonitor: { shown: "shown", memory: true } },
        arrangement: DEFAULT_ARRANGEMENT,
        layoutCarryDone: true,
      },
      4,
    );

    expect(getLayoutSnapshot().overrides.resourceMonitor).toEqual({
      shown: "shown",
      memory: true,
    });
    expect(
      effectiveLayoutValues("default", getLayoutSnapshot().overrides)
        .resourceMonitor.agentRows,
    ).toBe(true);
  });

  it("forces nothing when there is no resourceMonitor override at all", async () => {
    await rehydrateFromVersion(
      {
        basePreset: "default",
        overrides: {},
        arrangement: DEFAULT_ARRANGEMENT,
        layoutCarryDone: true,
      },
      4,
    );

    expect(getLayoutSnapshot().overrides.resourceMonitor).toBeUndefined();
    expect(
      effectiveLayoutValues("default", getLayoutSnapshot().overrides)
        .resourceMonitor.agentRows,
    ).toBe(true);
  });

  it("leaves a version-5 record completely untouched, even a hidden monitor with no agentRows", async () => {
    await rehydrateFromVersion(
      {
        basePreset: "default",
        overrides: { resourceMonitor: { shown: "hidden" } },
        arrangement: DEFAULT_ARRANGEMENT,
        layoutCarryDone: true,
      },
      5,
    );

    // A version-5 record shaped like this cannot occur from a real write
    // (this build always writes both halves together) - the point is that
    // the migration is gated on VERSION, not re-derived from shape, so it
    // does not reach in and force agentRows here the way it would at v4.
    expect(getLayoutSnapshot().overrides.resourceMonitor).toEqual({
      shown: "hidden",
    });
  });

  it("does not clobber a v4 record whose agentRows already differs from what the migration would force", async () => {
    await rehydrateFromVersion(
      {
        basePreset: "default",
        overrides: {
          resourceMonitor: { shown: "hidden", agentRows: true },
        },
        arrangement: DEFAULT_ARRANGEMENT,
        layoutCarryDone: true,
      },
      4,
    );

    expect(getLayoutSnapshot().overrides.resourceMonitor).toEqual({
      shown: "hidden",
      agentRows: true,
    });
  });

  it("is idempotent: migrating an already-migrated record twice gives the same result", async () => {
    await rehydrateFromVersion(
      {
        basePreset: "default",
        overrides: { resourceMonitor: { shown: "hidden" } },
        arrangement: DEFAULT_ARRANGEMENT,
        layoutCarryDone: true,
      },
      4,
    );
    const once = getLayoutSnapshot().overrides.resourceMonitor;

    // Rehydrating the now-migrated shape again, tagged as this build's own
    // version, must not move it any further.
    await rehydrateFromVersion(
      {
        basePreset: "default",
        overrides: { resourceMonitor: once },
        arrangement: DEFAULT_ARRANGEMENT,
        layoutCarryDone: true,
      },
      5,
    );
    const twice = getLayoutSnapshot().overrides.resourceMonitor;

    expect(twice).toEqual(once);
  });

  it("migrates once, rather than re-deriving agentRows from Shown on every later write", async () => {
    await rehydrateFromVersion(
      {
        basePreset: "default",
        overrides: { resourceMonitor: { shown: "hidden" } },
        arrangement: DEFAULT_ARRANGEMENT,
        layoutCarryDone: true,
      },
      4,
    );
    expect(getLayoutSnapshot().overrides.resourceMonitor).toEqual({
      shown: "hidden",
      agentRows: false,
    });

    // Un-hiding the monitor alone, after the migration already ran, must not
    // also flip the rows' own switch back on - a re-coupling would make it
    // impossible to un-hide the monitor without also un-hiding the rows.
    useLayoutStore
      .getState()
      .setRegionValues("resourceMonitor", { shown: "shown" });

    expect(getLayoutSnapshot().overrides.resourceMonitor).toEqual({
      shown: "shown",
      agentRows: false,
    });
  });
});
