import { act, cleanup, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  useArrangementValue,
  useLayoutArrangement,
  useRailVisibility,
  useRegionShown,
  useRegionValue,
  useRegionValues,
  type LayoutOverride,
} from "@/lib/layout-overrides";
import { LayoutOverrideProvider } from "@/providers/layout-override-provider";
import { PRESET_VALUES } from "@/lib/layout/layout-values";
import {
  DEFAULT_LAYOUT_SNAPSHOT,
  useLayoutStore,
} from "@/stores/layout/layout-store";

function resetStore(): void {
  useLayoutStore.setState({ ...DEFAULT_LAYOUT_SNAPSHOT });
}

beforeEach(resetStore);
afterEach(() => {
  cleanup();
  resetStore();
});

/** Renders `read()` in a probe and hands back whatever it returned. */
function readUnder<Value>(
  read: () => Value,
  wrap: (children: ReactNode) => ReactNode,
): Value {
  // A list rather than a `let … | null`: assigning inside the probe is
  // invisible to control-flow narrowing, so the null check afterwards reads as
  // a comparison against a literal `null` type.
  const seen: Value[] = [];
  function Probe(): null {
    seen.push(read());
    return null;
  }
  render(<>{wrap(<Probe />)}</>);
  const value = seen.at(-1);
  if (value === undefined) throw new Error("the probe did not render");
  return value;
}

const bare = (children: ReactNode): ReactNode => children;

function under(value: LayoutOverride) {
  return (children: ReactNode): ReactNode => (
    <LayoutOverrideProvider value={value}>{children}</LayoutOverrideProvider>
  );
}

describe("layout override seam", () => {
  describe("with no provider mounted", () => {
    it("returns the effective value of a region", () => {
      act(() => {
        useLayoutStore.getState().setRegionValues("mic", { shown: "hidden" });
      });

      expect(readUnder(() => useRegionValues("mic"), bare)).toEqual({
        shown: "hidden",
      });
      expect(readUnder(() => useRegionShown("mic"), bare)).toBe(false);
    });

    it("falls back to the base preset for an untouched region", () => {
      expect(readUnder(() => useRegionValue("model", "style"), bare)).toBe(
        PRESET_VALUES[DEFAULT_LAYOUT_SNAPSHOT.basePreset].model.style,
      );
    });

    it("returns the stored arrangement field", () => {
      act(() => {
        useLayoutStore.getState().setArrangement({
          ...useLayoutStore.getState().arrangement,
          minimapSide: "left",
        });
      });

      expect(readUnder(() => useArrangementValue("minimapSide"), bare)).toBe(
        "left",
      );
    });
  });

  it("draws the override while the store says otherwise", () => {
    expect(readUnder(() => useRegionShown("mic"), bare)).toBe(true);

    expect(
      readUnder(
        () => useRegionShown("mic"),
        under({ values: { mic: { shown: "hidden" } } }),
      ),
    ).toBe(false);
    // The store is untouched: an override is a drawing, never a write.
    expect(useLayoutStore.getState().overrides.mic).toBeUndefined();
  });

  it("leaves every unstated leaf on the stored value", () => {
    act(() => {
      useLayoutStore.getState().setRegionValues("model", { style: "bars" });
    });

    const model = readUnder(
      () => useRegionValues("model"),
      under({ values: { model: { shown: "hidden" } } }),
    );

    expect(model.shown).toBe("hidden");
    expect(model.style).toBe("bars");
  });

  it("keeps the outer override when an inner one names a different leaf", () => {
    const model = readUnder(
      () => useRegionValues("model"),
      (children) => (
        <LayoutOverrideProvider
          value={{ values: { model: { style: "bars" } } }}
        >
          <LayoutOverrideProvider
            value={{ values: { model: { shown: "hidden" } } }}
          >
            {children}
          </LayoutOverrideProvider>
        </LayoutOverrideProvider>
      ),
    );

    expect(model.style).toBe("bars");
    expect(model.shown).toBe("hidden");
  });

  it("keeps the outer override when an inner one names a different region", () => {
    const wrap = (children: ReactNode): ReactNode => (
      <LayoutOverrideProvider value={{ values: { mic: { shown: "hidden" } } }}>
        <LayoutOverrideProvider
          value={{ values: { model: { shown: "hidden" } } }}
        >
          {children}
        </LayoutOverrideProvider>
      </LayoutOverrideProvider>
    );

    expect(readUnder(() => useRegionShown("mic"), wrap)).toBe(false);
    expect(readUnder(() => useRegionShown("model"), wrap)).toBe(false);
  });

  it("lets the inner override win on the leaf both name", () => {
    const model = readUnder(
      () => useRegionValues("model"),
      (children) => (
        <LayoutOverrideProvider
          value={{ values: { model: { style: "bars" } } }}
        >
          <LayoutOverrideProvider
            value={{ values: { model: { style: "text" } } }}
          >
            {children}
          </LayoutOverrideProvider>
        </LayoutOverrideProvider>
      ),
    );

    expect(model.style).toBe("text");
  });

  it("merges the arrangement field by field", () => {
    const arrangement = readUnder(useLayoutArrangement, (children) => (
      <LayoutOverrideProvider value={{ arrangement: { minimapSide: "left" } }}>
        <LayoutOverrideProvider
          value={{ arrangement: { resourceSide: "left" } }}
        >
          {children}
        </LayoutOverrideProvider>
      </LayoutOverrideProvider>
    ));

    expect(arrangement.minimapSide).toBe("left");
    expect(arrangement.resourceSide).toBe("left");
    expect(arrangement.dock).toBe(useLayoutStore.getState().arrangement.dock);
  });

  it("hands a rail panel its three-state visibility rather than a boolean", () => {
    expect(readUnder(() => useRailVisibility("railAgents"), bare)).toBe("auto");
    expect(
      readUnder(
        () => useRailVisibility("railAgents"),
        under({ values: { railAgents: { shown: "hidden" } } }),
      ),
    ).toBe("hidden");
  });

  describe("leaf hooks subscribe to one field", () => {
    it("does not rerender when another region changes", () => {
      // The regression this pins: routing one-field readers through a
      // whole-store read made the mic button rerender whenever any other
      // region changed - an element on screen all day, rerendering on a value
      // about a different element.
      let renders = 0;
      function MicProbe(): null {
        useRegionValue("mic", "shown");
        renders += 1;
        return null;
      }
      render(<MicProbe />);
      const before = renders;

      act(() => {
        useLayoutStore.getState().setRegionValues("access", { size: "chip" });
      });

      expect(renders).toBe(before);

      // …and it still rerenders for its OWN region, or the hook would be
      // useless.
      act(() => {
        useLayoutStore.getState().setRegionValues("mic", { shown: "hidden" });
      });
      expect(renders).toBeGreaterThan(before);
    });

    it("does not rerender an arrangement reader when a values region changes", () => {
      let renders = 0;
      function SideProbe(): null {
        useArrangementValue("minimapSide");
        renders += 1;
        return null;
      }
      render(<SideProbe />);
      const before = renders;

      act(() => {
        useLayoutStore.getState().setRegionValues("mic", { shown: "hidden" });
      });

      expect(renders).toBe(before);
    });
  });
});
