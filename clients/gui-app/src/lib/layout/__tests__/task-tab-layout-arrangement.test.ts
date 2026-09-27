import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolvePersistedArrangement } from "@/lib/layout/arrangement-persist";
import { writeArrangementField } from "@/lib/layout/arrangement-gestures";
import { DEFAULT_ARRANGEMENT } from "@/lib/layout/layout-arrangement";
import {
  layoutChanges,
  layoutModified,
  resetLayout,
  revertLayoutChange,
} from "@/lib/layout/layout-diff";
import { persistKey, STORE_KEYS } from "@/lib/persist";
import {
  useLayoutEditorStore,
  type LayoutEditorState,
} from "@/stores/layout/layout-editor-store";
import {
  DEFAULT_LAYOUT_SNAPSHOT,
  getLayoutSnapshot,
  useLayoutStore,
} from "@/stores/layout/layout-store";

/**
 * Tab overflow moved from the settings store into `LayoutArrangement.taskTabLayout`
 * (version 6): the version-6 migration carries a legacy settings record's own
 * value once, the field is an ordinary `ArrangementField` on the change list,
 * and every write to it goes through `writeArrangementField`, so it is undoable
 * and Discard-able like any other arrangement pick.
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

function editorState(): LayoutEditorState {
  return useLayoutEditorStore.getState();
}

function beginSession(): void {
  useLayoutEditorStore.getState().beginSession({
    entry: "pointer",
    source: "direct_ui",
    startedAt: 0,
    origin: { kind: "tab" },
  });
}

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

  it("falls back to scroll for a value neither record makes valid", () => {
    expect(
      resolvePersistedArrangement({
        ...DEFAULT_ARRANGEMENT,
        taskTabLayout: "wrap",
      }).taskTabLayout,
    ).toBe("scroll");
    expect(
      resolvePersistedArrangement({
        ...DEFAULT_ARRANGEMENT,
        taskTabLayout: undefined,
      }).taskTabLayout,
    ).toBe("scroll");
  });
});

describe('writeArrangementField("taskTabLayout", ...)', () => {
  it("is one undo step", () => {
    beginSession();

    writeArrangementField("taskTabLayout", "shrink");

    expect(getLayoutSnapshot().arrangement.taskTabLayout).toBe("shrink");
    expect(editorState().history.past).toHaveLength(1);

    editorState().undo();

    expect(getLayoutSnapshot().arrangement.taskTabLayout).toBe("scroll");
  });

  it("Discard restores the entry snapshot's value", () => {
    beginSession();

    writeArrangementField("taskTabLayout", "shrink");
    editorState().discard();

    expect(getLayoutSnapshot().arrangement.taskTabLayout).toBe("scroll");
  });
});

describe("the change list", () => {
  it("a shrink layout is a field line, current shrink and baseline scroll", () => {
    useLayoutStore
      .getState()
      .setArrangement({ ...DEFAULT_ARRANGEMENT, taskTabLayout: "shrink" });

    expect(layoutModified(getLayoutSnapshot())).toBe(true);
    const line = layoutChanges(getLayoutSnapshot()).arrangement.find(
      (candidate) =>
        candidate.kind === "field" && candidate.field === "taskTabLayout",
    );
    expect(line).toEqual({
      kind: "field",
      field: "taskTabLayout",
      current: "shrink",
      baseline: "scroll",
    });
  });

  it("revertLayoutChange on that line restores scroll", () => {
    useLayoutStore
      .getState()
      .setArrangement({ ...DEFAULT_ARRANGEMENT, taskTabLayout: "shrink" });
    const line = layoutChanges(getLayoutSnapshot()).arrangement.find(
      (candidate) =>
        candidate.kind === "field" && candidate.field === "taskTabLayout",
    );
    if (line === undefined) throw new Error("expected a taskTabLayout change");

    const reverted = revertLayoutChange(getLayoutSnapshot(), line);

    expect(reverted.arrangement.taskTabLayout).toBe("scroll");
  });

  it("resetLayout restores scroll", () => {
    useLayoutStore
      .getState()
      .setArrangement({ ...DEFAULT_ARRANGEMENT, taskTabLayout: "shrink" });

    expect(resetLayout(getLayoutSnapshot()).arrangement.taskTabLayout).toBe(
      "scroll",
    );
  });
});
