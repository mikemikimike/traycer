import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_ARRANGEMENT } from "@/lib/layout/layout-arrangement";
import { persistKey, STORE_KEYS } from "@/lib/persist";
import { useLayoutEditorStore } from "@/stores/layout/layout-editor-store";
import {
  DEFAULT_LAYOUT_SNAPSHOT,
  useLayoutStore,
} from "@/stores/layout/layout-store";

/**
 * Tab overflow moved from the settings store into `LayoutArrangement.taskTabLayout`
 * (version 6): the version-6 migration carries a legacy settings record's own
 * value once, and never again once the layout record answers for itself.
 */

const LAYOUT_KEY = persistKey(STORE_KEYS.layout);
const SETTINGS_KEY = persistKey(STORE_KEYS.settings);
const CURRENT_LAYOUT_VERSION = 6;

function reset(): void {
  useLayoutStore.setState({
    ...DEFAULT_LAYOUT_SNAPSHOT,
    layoutCarryDone: true,
  });
  useLayoutEditorStore.getState().endSession();
  window.localStorage.clear();
}

beforeEach(reset);
afterEach(reset);

function writeSettingsRecord(taskTabLayout: unknown): void {
  window.localStorage.setItem(
    SETTINGS_KEY,
    JSON.stringify({ state: { taskTabLayout }, version: 1 }),
  );
}

function writeLayoutRecord(state: unknown, version: number): void {
  window.localStorage.setItem(LAYOUT_KEY, JSON.stringify({ state, version }));
}

/** A relaunch, module load and all: the only way legacy records are re-read. */
async function relaunchLayoutStore(): Promise<{
  readonly arrangementTaskTabLayout: () => string;
}> {
  vi.resetModules();
  const module = await import("@/stores/layout/layout-store");
  return {
    arrangementTaskTabLayout: () =>
      module.useLayoutStore.getState().arrangement.taskTabLayout,
  };
}

describe("the version-6 migration carrying Tab overflow off the settings store", () => {
  it("carries a v5 record's missing field from the legacy settings record", async () => {
    writeSettingsRecord("shrink");
    writeLayoutRecord(
      {
        basePreset: "default",
        overrides: {},
        arrangement: DEFAULT_ARRANGEMENT,
        layoutCarryDone: true,
      },
      5,
    );

    const { arrangementTaskTabLayout } = await relaunchLayoutStore();

    expect(arrangementTaskTabLayout()).toBe("shrink");
  });

  it("keeps a v6 record's own value regardless of the settings record", async () => {
    writeSettingsRecord("shrink");
    writeLayoutRecord(
      {
        basePreset: "default",
        overrides: {},
        arrangement: { ...DEFAULT_ARRANGEMENT, taskTabLayout: "scroll" },
        layoutCarryDone: true,
      },
      CURRENT_LAYOUT_VERSION,
    );

    const { arrangementTaskTabLayout } = await relaunchLayoutStore();

    expect(arrangementTaskTabLayout()).toBe("scroll");
  });
});
