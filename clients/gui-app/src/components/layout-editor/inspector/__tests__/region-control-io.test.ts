import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  changedControlKeys,
  isControlValueChanged,
  readControlValue,
  revertControlValue,
  revertControlValues,
  writeControlValue,
} from "@/components/layout-editor/inspector/region-control-io";
import { PRESET_VALUES } from "@/lib/layout/layout-presets";
import { useLayoutEditorStore } from "@/stores/layout/layout-editor-store";
import {
  DEFAULT_LAYOUT_SNAPSHOT,
  getLayoutSnapshot,
  useLayoutStore,
} from "@/stores/layout/layout-store";

/**
 * The dynamic half of the region grammar, which is the seam a reviewer is
 * right to distrust: a control names its key as a string, so nothing in the
 * type system stops a registry typo from reaching the store. What this suite
 * pins is that the seam is sound anyway - the write path parses, the revert
 * path only touches keys the region really has, and a multi-key revert is one
 * undo step rather than five.
 */

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

describe("reading one control's value", () => {
  it("hands back the region's own leaf, whatever shape it is", () => {
    const values = PRESET_VALUES.default;

    expect(readControlValue(values.model, "style")).toBe(values.model.style);
    expect(readControlValue(values.usageLimits, "bar")).toBe(
      values.usageLimits.bar,
    );
    expect(readControlValue(values.contextUsage, "pinnedFields")).toEqual(
      values.contextUsage.pinnedFields,
    );
  });
});

describe("writing and reverting", () => {
  it("writes through the gesture path and reports the key as changed", () => {
    writeControlValue("model", "style", "bars");

    expect(getLayoutSnapshot().overrides).toEqual({ model: { style: "bars" } });
    expect(isControlValueChanged("model", "style")).toBe(true);
    expect(isControlValueChanged("model", "shown")).toBe(false);
  });

  it("drops the region once its last changed key goes back to the base", () => {
    writeControlValue("model", "style", "bars");

    revertControlValue("model", "style");

    expect(getLayoutSnapshot().overrides).toEqual({});
  });

  it("reverts several keys at once and leaves the rest of the region alone", () => {
    writeControlValue("usageLimits", "bar", false);
    writeControlValue("usageLimits", "word", false);

    expect(changedControlKeys("usageLimits", ["bar", "word", "shown"])).toEqual(
      ["bar", "word"],
    );

    revertControlValues("usageLimits", ["bar"]);

    expect(getLayoutSnapshot().overrides).toEqual({
      usageLimits: { word: false },
    });
  });

  it("makes a multi-key revert ONE write, so it is one undo step", () => {
    writeControlValue("usageLimits", "bar", false);
    writeControlValue("usageLimits", "word", false);

    let notifications = 0;
    const unsubscribe = useLayoutStore.subscribe(() => {
      notifications += 1;
    });
    revertControlValues("usageLimits", ["bar", "word"]);
    unsubscribe();

    expect(notifications).toBe(1);
    expect(getLayoutSnapshot().overrides).toEqual({});
  });

  it("ignores a key the region does not have rather than writing it", () => {
    // The membership test is a real one (`key in base`), not a predicate that
    // only claims to be: a registry typo reverts nothing instead of persisting
    // a field no build reads (G1-08).
    revertControlValues("model", ["stlye", "style"]);

    expect(getLayoutSnapshot().overrides).toEqual({});
  });

  it("refuses a value this build has no case for", () => {
    writeControlValue("mic", "shown", "sideways");

    expect(getLayoutSnapshot().overrides).toEqual({});
  });
});
