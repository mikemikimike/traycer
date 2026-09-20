import { describe, expect, it } from "vitest";
import { DEFAULT_ARRANGEMENT } from "@/lib/layout/layout-arrangement";
import {
  EMPTY_LAYOUT_HISTORY,
  LAYOUT_HISTORY_CAP,
  rebaseLayoutSnapshot,
  recordLayoutChange,
  redoLayout,
  undoLayout,
  type LayoutHistory,
} from "@/lib/layout/layout-history";
import {
  DEFAULT_LAYOUT_SNAPSHOT,
  type LayoutSnapshot,
} from "@/stores/layout/layout-store";

function withModelStyle(style: "text" | "bars"): LayoutSnapshot {
  return {
    ...DEFAULT_LAYOUT_SNAPSHOT,
    overrides: style === "text" ? {} : { model: { style } },
  };
}

describe("undo and redo", () => {
  it("walks back to the state a gesture replaced and forward again", () => {
    const before = withModelStyle("text");
    const after = withModelStyle("bars");
    const history = recordLayoutChange(EMPTY_LAYOUT_HISTORY, before);

    const undone = undoLayout(history, after);

    expect(undone?.snapshot).toEqual(before);

    const redone = redoLayout(undone?.history ?? EMPTY_LAYOUT_HISTORY, before);

    expect(redone?.snapshot).toEqual(after);
    expect(redone?.history).toEqual({ past: [before], future: [] });
  });

  it("has nothing to travel to on an empty history", () => {
    const current = withModelStyle("bars");

    expect(undoLayout(EMPTY_LAYOUT_HISTORY, current)).toBeNull();
    expect(redoLayout(EMPTY_LAYOUT_HISTORY, current)).toBeNull();
  });

  it("drops the redo stack when a new gesture branches off it", () => {
    const first = withModelStyle("text");
    const second = withModelStyle("bars");
    const history = recordLayoutChange(EMPTY_LAYOUT_HISTORY, first);
    const undone = undoLayout(history, second);

    const branched = recordLayoutChange(
      undone?.history ?? EMPTY_LAYOUT_HISTORY,
      first,
    );

    expect(branched.future).toEqual([]);
    expect(redoLayout(branched, first)).toBeNull();
  });

  it("keeps the newest entries once the cap is reached", () => {
    let history: LayoutHistory = EMPTY_LAYOUT_HISTORY;
    for (let step = 0; step < LAYOUT_HISTORY_CAP + 5; step += 1) {
      history = recordLayoutChange(history, {
        ...DEFAULT_LAYOUT_SNAPSHOT,
        arrangement: { ...DEFAULT_ARRANGEMENT, dividerSeq: step },
      });
    }

    expect(history.past).toHaveLength(LAYOUT_HISTORY_CAP);
    expect(history.past[0].arrangement.dividerSeq).toBe(5);
    expect(history.past.at(-1)?.arrangement.dividerSeq).toBe(
      LAYOUT_HISTORY_CAP + 4,
    );
  });
});

describe("rebasing the entry snapshot on an external write", () => {
  const entry: LayoutSnapshot = {
    ...DEFAULT_LAYOUT_SNAPSHOT,
    overrides: { model: { style: "bars" } },
  };
  const previous: LayoutSnapshot = {
    ...DEFAULT_LAYOUT_SNAPSHOT,
    overrides: { mic: { shown: "hidden" } },
  };

  it("takes the field the other writer moved and keeps the rest of the entry", () => {
    const next: LayoutSnapshot = {
      ...previous,
      arrangement: { ...DEFAULT_ARRANGEMENT, usageHost: "header" },
    };

    const rebased = rebaseLayoutSnapshot(entry, previous, next);

    // Discard now puts the page back to how this session found it, WITH the
    // other window's move - rather than undoing a change it never made.
    expect(rebased.arrangement.usageHost).toBe("header");
    expect(rebased.arrangement.minimapSide).toBe(
      DEFAULT_ARRANGEMENT.minimapSide,
    );
    expect(rebased.overrides).toEqual({ model: { style: "bars" } });
  });

  it("takes a region the other writer changed and leaves a region it did not", () => {
    const next: LayoutSnapshot = {
      ...previous,
      overrides: {
        mic: { shown: "hidden" },
        homeTab: { shown: "shown" },
      },
    };

    const rebased = rebaseLayoutSnapshot(entry, previous, next);

    expect(rebased.overrides).toEqual({
      model: { style: "bars" },
      homeTab: { shown: "shown" },
    });
  });

  it("takes a base preset the other writer switched", () => {
    const next: LayoutSnapshot = { ...previous, basePreset: "compact" };

    const rebased = rebaseLayoutSnapshot(entry, previous, next);

    expect(rebased.basePreset).toBe("compact");
    // Re-minimized against the new base, like any other write: Compact draws
    // the model chip as bars already.
    expect(rebased.overrides).toEqual({});
  });

  it("changes nothing when the other writer changed nothing", () => {
    expect(rebaseLayoutSnapshot(entry, previous, previous)).toEqual(entry);
  });
});
