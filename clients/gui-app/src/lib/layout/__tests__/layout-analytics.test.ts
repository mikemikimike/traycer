import { beforeEach, describe, expect, it } from "vitest";
import { analyticsEventContractIsComplete } from "@/lib/analytics";
import { DEFAULT_ARRANGEMENT } from "@/lib/layout/layout-arrangement";
import {
  layoutDurationBucket,
  layoutEditorSessionChangeSummary,
  layoutSnapshotProperties,
  touchedRegionIds,
  LAYOUT_SETTING_PROPERTY_KEYS,
  type LayoutSnapshotProperties,
} from "@/lib/layout/layout-diff";
import { PRESET_VALUES } from "@/lib/layout/layout-presets";
import { claimLayoutSnapshotWindow } from "@/lib/layout/layout-snapshot-gate";
import type { LayoutSnapshot } from "@/lib/layout/layout-snapshot";
import { persistKey, STORE_KEYS } from "@/lib/persist";
import { DEFAULT_LAYOUT_SNAPSHOT } from "@/stores/layout/layout-store";

const LAYOUT_SNAPSHOT_KEY = persistKey(STORE_KEYS.layoutSnapshot);

beforeEach(() => {
  window.localStorage.removeItem(LAYOUT_SNAPSHOT_KEY);
});

/**
 * Swaps the WHOLE `window.localStorage` reference for one whose named methods
 * throw, runs `run`, and always restores the original - `Object.defineProperty`
 * on an individual method of jsdom's Proxy-backed `Storage` does not reliably
 * intercept the module's own calls (see the two "storage unavailable" tests).
 */
function withThrowingLocalStorage(
  throwingMethods: ReadonlyArray<"getItem" | "setItem">,
  run: () => void,
): void {
  const original = window.localStorage;
  const backing = new Map<string, string>();
  const throwing = (): never => {
    throw new Error("storage disabled");
  };
  const replacement: Storage = {
    get length() {
      return backing.size;
    },
    clear: () => backing.clear(),
    getItem: throwingMethods.includes("getItem")
      ? throwing
      : (key) => backing.get(key) ?? null,
    key: (index) => Array.from(backing.keys())[index] ?? null,
    removeItem: (key) => {
      backing.delete(key);
    },
    setItem: throwingMethods.includes("setItem")
      ? throwing
      : (key, value) => {
          backing.set(key, value);
        },
  };
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: replacement,
  });
  try {
    run();
  } finally {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: original,
    });
  }
}

describe("layoutSnapshotProperties (L-46, L-54, L-55)", () => {
  it("reports every declared setting as 'default' on an untouched snapshot", () => {
    const properties = layoutSnapshotProperties(DEFAULT_LAYOUT_SNAPSHOT);

    for (const key of LAYOUT_SETTING_PROPERTY_KEYS) {
      expect(properties[key as keyof LayoutSnapshotProperties]).toBe("default");
    }
    expect(properties.changed_from_default_count).toBe(0);
    expect(properties.base_preset).toBe("default");
    expect(properties.layout_usage_host).toBe("status-bar");
    expect(properties.layout_minimap_side).toBe("right");
    expect(properties.layout_resource_side).toBe("right");
    expect(properties.layout_dock_reordered).toBe(false);
    expect(properties.layout_toolbar_left_reordered).toBe(false);
    expect(properties.layout_toolbar_right_reordered).toBe(false);
    expect(properties.layout_rail_reordered).toBe(false);
    expect(properties.layout_usage_providers_reordered).toBe(false);
  });

  it("reports a scalar leaf's literal value once it differs, never omitting the key", () => {
    const snapshot: LayoutSnapshot = {
      ...DEFAULT_LAYOUT_SNAPSHOT,
      overrides: { mic: { shown: "hidden" } },
    };

    const properties = layoutSnapshotProperties(snapshot);

    expect(properties.layout_mic_shown).toBe("hidden");
    expect(properties.changed_from_default_count).toBe(1);
    // Every other declared key is still present and still "default" - the
    // event is dense, never sparse (L-55).
    expect(Object.keys(properties)).toHaveLength(
      LAYOUT_SETTING_PROPERTY_KEYS.length + 10,
    );
  });

  it("reports a boolean leaf as 'true'/'false', never a JS boolean", () => {
    const snapshot: LayoutSnapshot = {
      ...DEFAULT_LAYOUT_SNAPSHOT,
      overrides: { resourceMonitor: { memory: true } },
    };

    const properties = layoutSnapshotProperties(snapshot);

    expect(properties.layout_resource_monitor_memory).toBe("true");
    expect(typeof properties.layout_resource_monitor_memory).toBe("string");
  });

  it("reports the list leaf (pinnedFields) as 'changed', never the list itself", () => {
    const snapshot: LayoutSnapshot = {
      ...DEFAULT_LAYOUT_SNAPSHOT,
      overrides: { contextUsage: { pinnedFields: ["cacheRead"] } },
    };

    const properties = layoutSnapshotProperties(snapshot);

    expect(properties.layout_context_usage_pinned_fields).toBe("changed");
    expect(JSON.stringify(properties)).not.toContain("cacheRead");
  });

  it("diffs against the SHIPPED Default, not the base preset", () => {
    // Compact changes several values off the shipped Default; a snapshot
    // whose base IS Compact with no further overrides must still report
    // those as non-default, because the denominator is the shipped Default.
    const snapshot: LayoutSnapshot = {
      ...DEFAULT_LAYOUT_SNAPSHOT,
      basePreset: "compact",
    };

    const properties = layoutSnapshotProperties(snapshot);

    expect(properties.base_preset).toBe("compact");
    expect(properties.layout_usage_limits_bar).toBe("false");
    expect(properties.layout_mic_shown).toBe("hidden");
    expect(properties.changed_from_default_count).toBeGreaterThan(0);
  });

  it("reports each reorder group's own boolean, independent of the others", () => {
    const snapshot: LayoutSnapshot = {
      ...DEFAULT_LAYOUT_SNAPSHOT,
      arrangement: {
        ...DEFAULT_ARRANGEMENT,
        toolbarLeft: [...DEFAULT_ARRANGEMENT.toolbarLeft].reverse(),
      },
    };

    const properties = layoutSnapshotProperties(snapshot);

    expect(properties.layout_toolbar_left_reordered).toBe(true);
    expect(properties.layout_dock_reordered).toBe(false);
    expect(properties.layout_rail_reordered).toBe(false);
    expect(properties.layout_toolbar_right_reordered).toBe(false);
    expect(properties.layout_usage_providers_reordered).toBe(false);
  });

  it("never carries shownProfiles, providerLimits, hiddenProviders or limitKeys", () => {
    const snapshot: LayoutSnapshot = {
      ...DEFAULT_LAYOUT_SNAPSHOT,
      arrangement: {
        ...DEFAULT_ARRANGEMENT,
        hiddenProviders: ["claude-code"],
        providerLimits: {
          "claude-code": { automatic: false, limitKeys: ["five-hour"] },
        },
        shownProfiles: { "host-1": { "claude-code": ["profile-a"] } },
      },
    };

    const properties = layoutSnapshotProperties(snapshot);
    const serialized = JSON.stringify(properties);

    // `layoutSnapshotProperties` only ever writes the declared key set
    // (`LAYOUT_SETTING_PROPERTY_KEYS` plus the ten named arrangement/count
    // fields - proven by the structural-parity tests below), so these
    // fields never reach the event even though the type's index signature
    // would allow reading them.
    expect(properties.shownProfiles).toBeUndefined();
    expect(properties.providerLimits).toBeUndefined();
    expect(serialized).not.toContain("profile-a");
    expect(serialized).not.toContain("five-hour");
    expect(serialized).not.toContain("claude-code");
  });
});

describe("structural parity: LayoutValues cannot drift from the declared properties", () => {
  it("declares exactly one layout_<region>_<key> property per LayoutValues leaf", () => {
    const regionIds = Object.keys(PRESET_VALUES.default) as ReadonlyArray<
      keyof typeof PRESET_VALUES.default
    >;
    const expectedCount = regionIds.reduce(
      (total, region) =>
        total + Object.keys(PRESET_VALUES.default[region]).length,
      0,
    );

    expect(LAYOUT_SETTING_PROPERTY_KEYS).toHaveLength(expectedCount);
    // No duplicate names: two regions or keys that snake-cased onto the same
    // property name would silently merge two settings into one property.
    expect(new Set(LAYOUT_SETTING_PROPERTY_KEYS).size).toBe(expectedCount);
  });

  it("names every declared property with the layout_<region>_<key> convention", () => {
    for (const key of LAYOUT_SETTING_PROPERTY_KEYS) {
      expect(key.startsWith("layout_")).toBe(true);
      expect(key).toMatch(/^layout_[a-z0-9_]+$/);
    }
  });

  it("keeps the event's built-in properties out of the per-setting key list", () => {
    const reserved = [
      "base_preset",
      "changed_from_default_count",
      "layout_usage_host",
      "layout_minimap_side",
      "layout_resource_side",
      "layout_dock_reordered",
      "layout_toolbar_left_reordered",
      "layout_toolbar_right_reordered",
      "layout_rail_reordered",
      "layout_usage_providers_reordered",
    ];
    for (const name of reserved) {
      expect(LAYOUT_SETTING_PROPERTY_KEYS).not.toContain(name);
    }
  });
});

describe("the analytics event contract", () => {
  it("is complete for every declared event, including the three layout ones", () => {
    expect(analyticsEventContractIsComplete()).toBe(true);
  });
});

describe("the 24h compare-and-set (L-54, C-46)", () => {
  it("claims the window on a device that has never sent one", () => {
    expect(claimLayoutSnapshotWindow(1_000)).toBe(true);
  });

  it("refuses a second claim inside the same 24h window", () => {
    expect(claimLayoutSnapshotWindow(1_000)).toBe(true);
    expect(claimLayoutSnapshotWindow(1_000 + 60_000)).toBe(false);
  });

  it("claims again once 24h have fully elapsed, and not one millisecond sooner", () => {
    const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
    expect(claimLayoutSnapshotWindow(0)).toBe(true);

    expect(claimLayoutSnapshotWindow(TWENTY_FOUR_HOURS_MS - 1)).toBe(false);
    expect(claimLayoutSnapshotWindow(TWENTY_FOUR_HOURS_MS)).toBe(true);
  });

  it("is a synchronous read-then-write, so a second immediate caller cannot also win", () => {
    // Simulates two renderers launching together: neither has observed the
    // other's write beforehand, so both call in immediate succession against
    // the same storage. Only the first may claim it.
    const results = [
      claimLayoutSnapshotWindow(5_000),
      claimLayoutSnapshotWindow(5_000),
    ];

    expect(results).toEqual([true, false]);
  });

  it("refuses rather than throws when storage is fully unavailable", () => {
    // jsdom's `Storage` is Proxy-backed, so shadowing `getItem`/`setItem` as
    // own properties on the existing object does not reliably intercept the
    // module's own `localStorage.getItem(...)` calls - the whole
    // `window.localStorage` reference has to be replaced, the same way
    // `installMockLocalStorage` (`__tests__/test-browser-apis.ts`) does it.
    withThrowingLocalStorage(["getItem", "setItem"], () => {
      expect(claimLayoutSnapshotWindow(1_000)).toBe(false);
    });
  });

  it("refuses when the write cannot persist, even though the read succeeded", () => {
    // The write failing is the case that must not send: sending here would
    // re-claim on every future launch, since the timestamp never lands.
    withThrowingLocalStorage(["setItem"], () => {
      expect(claimLayoutSnapshotWindow(1_000)).toBe(false);
    });
  });
});

describe("layoutDurationBucket", () => {
  it("buckets at the documented edges", () => {
    expect(layoutDurationBucket(0)).toBe("under_10s");
    expect(layoutDurationBucket(9_999)).toBe("under_10s");
    expect(layoutDurationBucket(10_000)).toBe("10s_to_1m");
    expect(layoutDurationBucket(59_999)).toBe("10s_to_1m");
    expect(layoutDurationBucket(60_000)).toBe("1m_to_5m");
    expect(layoutDurationBucket(299_999)).toBe("1m_to_5m");
    expect(layoutDurationBucket(300_000)).toBe("over_5m");
    expect(layoutDurationBucket(1_000_000)).toBe("over_5m");
  });
});

describe("touchedRegionIds and the session change summary", () => {
  it("names only the regions whose effective values actually moved", () => {
    const entry = DEFAULT_LAYOUT_SNAPSHOT;
    const exit: LayoutSnapshot = {
      ...DEFAULT_LAYOUT_SNAPSHOT,
      overrides: { mic: { shown: "hidden" }, agent: { shown: "hidden" } },
    };

    expect([...touchedRegionIds(entry, exit)].sort()).toEqual(["agent", "mic"]);
  });

  it("counts a region touched exactly once regardless of how many keys it changed", () => {
    const entry = DEFAULT_LAYOUT_SNAPSHOT;
    const exit: LayoutSnapshot = {
      ...DEFAULT_LAYOUT_SNAPSHOT,
      overrides: { usageLimits: { bar: false, percent: false, word: false } },
    };

    const summary = layoutEditorSessionChangeSummary(entry, exit);

    expect(summary.regionsTouchedCount).toBe(1);
    expect(summary.changedCount).toBe(3);
  });

  it("reports zero touched regions when entry and exit are the same snapshot", () => {
    const summary = layoutEditorSessionChangeSummary(
      DEFAULT_LAYOUT_SNAPSHOT,
      DEFAULT_LAYOUT_SNAPSHOT,
    );

    expect(summary.regionsTouchedCount).toBe(0);
    expect(summary.changedCount).toBe(0);
  });

  it("counts changed_count against the base preset, matching what a reset would revert", () => {
    // A preset switch with no further edits is zero VALUE changes, even
    // though every leaf's literal value differs from Compact's own base.
    const exit: LayoutSnapshot = {
      ...DEFAULT_LAYOUT_SNAPSHOT,
      basePreset: "compact",
    };

    const summary = layoutEditorSessionChangeSummary(
      DEFAULT_LAYOUT_SNAPSHOT,
      exit,
    );

    expect(summary.changedCount).toBe(0);
    expect(summary.regionsTouchedCount).toBeGreaterThan(0);
  });
});
