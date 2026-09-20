import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SampleSceneProvider } from "@/components/sample-workspace/sample-scene-provider";
import { emptyTabStripLayout, tabItemId } from "@/stores/tabs/layout";
import { useTabsStore } from "@/stores/tabs/store";
import { tabCommandCoordinator } from "@/stores/tabs/tab-command-coordinator";
import type { TabRef } from "@/stores/tabs/types";

const viewport = vi.hoisted(() => ({ mobile: false }));
vi.mock("@/hooks/ui/use-mobile-viewport", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/ui/use-mobile-viewport")>()),
  useIsMobileViewport: () => viewport.mobile,
}));

const EPIC_REF: TabRef = { kind: "epic", id: "tab-a" };
const SAMPLE_REF: TabRef = { kind: "sample-workspace", id: "sample-workspace" };

function sampleTabCount(): number {
  return useTabsStore
    .getState()
    .items.filter(
      (item) => item.kind === "tab" && item.ref.kind === "sample-workspace",
    ).length;
}

/**
 * Sample tab retained in the strip, NOT the active item, with no surface
 * mounted - through the ordinary tab machinery rather than the editor's own
 * door, which is not open yet (that is ticket 07's `lib/layout/editor-session.ts`).
 */
function seedBackgroundSampleTab(): void {
  useTabsStore.setState({
    ...emptyTabStripLayout(),
    items: [
      { kind: "tab", id: tabItemId(EPIC_REF), ref: EPIC_REF },
      { kind: "tab", id: tabItemId(SAMPLE_REF), ref: SAMPLE_REF },
    ],
    activeItemId: tabItemId(EPIC_REF),
    stripOrder: [EPIC_REF, SAMPLE_REF],
  });
  expect(sampleTabCount()).toBe(1);
}

beforeEach(() => {
  viewport.mobile = false;
  tabCommandCoordinator.resetReconciliationForTesting();
});
afterEach(() => {
  cleanup();
  useTabsStore.setState({ ...emptyTabStripLayout(), stripOrder: [] });
});

describe("SampleSceneProvider global close guard", () => {
  it("leaves the background sample tab alone at desktop width", () => {
    seedBackgroundSampleTab();

    render(<SampleSceneProvider>{null}</SampleSceneProvider>);

    expect(sampleTabCount()).toBe(1);
  });

  it("closes a retained background sample tab when the viewport drops below md", () => {
    seedBackgroundSampleTab();
    const view = render(<SampleSceneProvider>{null}</SampleSceneProvider>);

    viewport.mobile = true;
    act(() => {
      view.rerender(<SampleSceneProvider>{null}</SampleSceneProvider>);
    });

    expect(sampleTabCount()).toBe(0);
  });

  it("closes a stale sample tab on mount if the viewport is already narrow", () => {
    viewport.mobile = true;
    seedBackgroundSampleTab();

    render(<SampleSceneProvider>{null}</SampleSceneProvider>);

    expect(sampleTabCount()).toBe(0);
  });

  it("is a no-op when there is no sample tab", () => {
    useTabsStore.setState({ ...emptyTabStripLayout(), stripOrder: [] });
    const view = render(<SampleSceneProvider>{null}</SampleSceneProvider>);

    viewport.mobile = true;
    expect(() =>
      act(() => {
        view.rerender(<SampleSceneProvider>{null}</SampleSceneProvider>);
      }),
    ).not.toThrow();
    expect(useTabsStore.getState().items).toEqual([]);
  });
});
