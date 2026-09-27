import { describe, expect, it } from "vitest";
import {
  arrangementChangeLine,
  styleChangeLines,
} from "@/components/layout-editor/inspector/layout-change-lines";
import { layoutChanges, type LayoutChange } from "@/lib/layout/layout-diff";
import { effectiveLayoutValues } from "@/lib/layout/layout-presets";
import type { LayoutOverrides } from "@/lib/layout/layout-values";
import type { LayoutSnapshot } from "@/lib/layout/layout-snapshot";
import { DEFAULT_LAYOUT_SNAPSHOT } from "@/stores/layout/layout-store";

/**
 * `styleChangeLines` (item 7): a region's display (`shown`/`size`) is ONE
 * setting even though it is stored as two keys, so it is one line with both
 * changes folded in; every other key is its own line, read and reverted on
 * its own.
 */

function changeKey(change: LayoutChange): string {
  return change.kind === "value" ? change.key : change.kind;
}

function snapshotWithOverrides(overrides: LayoutOverrides): LayoutSnapshot {
  return { ...DEFAULT_LAYOUT_SNAPSHOT, overrides };
}

function lines(snapshot: LayoutSnapshot) {
  const changes = layoutChanges(snapshot);
  const values = effectiveLayoutValues(snapshot.basePreset, snapshot.overrides);
  return styleChangeLines(changes.styles, snapshot, values);
}

describe("a display change and a style change are two separate lines", () => {
  it("names each in the form's own words, and reverts only its own setting", () => {
    const snapshot = snapshotWithOverrides({
      contextUsage: { style: "ring-only", shown: "hidden" },
    });

    const result = lines(snapshot);
    expect(result).toHaveLength(2);

    const display = result.find((line) => line.label === "Context usage");
    const style = result.find((line) => line.label === "Context usage style");
    if (display === undefined || style === undefined) {
      throw new Error("expected both a display and a style line");
    }

    expect(display.current).toBe("Hidden");
    expect(display.baseline).toBe("Default: Shown");
    expect(display.changes.map(changeKey)).toEqual(["shown"]);

    expect(style.current).toBe("Ring only");
    expect(style.baseline).toBe("Default: Text");
    expect(style.changes.map(changeKey)).toEqual(["style"]);
  });
});

describe("a non-`style`-keyed style row (Model's Reasoning control)", () => {
  it("names the line by the row's own label, and words the value by its example", () => {
    const snapshot = snapshotWithOverrides({
      model: { reasoningControl: "list" },
    });

    const result = lines(snapshot);
    const line = result.find((entry) => entry.key === "model.reasoningControl");
    if (line === undefined) throw new Error("expected a reasoningControl line");

    expect(line.label).toBe("Model: Reasoning control");
    expect(line.current).toBe("List");
    expect(line.baseline).toBe("Default: Slider");
    expect(line.changes.map(changeKey)).toEqual(["reasoningControl"]);
  });
});

describe("a dock member's Chip+Hidden is one setting, not two", () => {
  it("folds shown and size into one line, reverted as one step", () => {
    const snapshot = snapshotWithOverrides({
      runningAgents: { shown: "hidden", size: "chip" },
    });

    const result = lines(snapshot);
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe("Running agents");
    expect(result[0].current).toBe("Hidden");
    expect(result[0].changes.map(changeKey).sort()).toEqual(["shown", "size"]);
  });
});

describe("Tool activity and Thinking read Open and Closed, not a dock row's words", () => {
  it("words each line by its own control's options", () => {
    const snapshot = snapshotWithOverrides({
      toolActivity: { size: "full" },
      thinking: { size: "full" },
    });

    const result = lines(snapshot);
    expect(
      result.map((line) => [line.label, line.current, line.baseline]),
    ).toEqual([
      ["Tool activity", "Open", "Default: Closed"],
      ["Thinking", "Open", "Default: Closed"],
    ]);
  });
});

describe("arrangementChangeLine - Reading width", () => {
  it("labels the field, its current word and its shipped default", () => {
    const line = arrangementChangeLine({
      kind: "field",
      field: "readingWidth",
      current: "wide",
      baseline: "comfortable",
    });

    expect(line.label).toBe("Reading width");
    expect(line.current).toBe("Wide");
    expect(line.baseline).toBe("Default: Comfortable");
  });
});
