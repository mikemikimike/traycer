/**
 * `focusGuideTarget` against the REAL `[data-layout-areas]` root: Settings ▸
 * Layout's area list is a select below `md` and a tab rail above it, both
 * mounted at once, so `guideTargetControl`'s own doc comment names this
 * exact target as the reason `firstReachable` has to skip a breakpoint's
 * control rather than just take the first DOM match.
 *
 * Narrow only. The desktop case - the rail's `role="tablist"` resolving to
 * its `aria-selected` tab rather than the list itself - is covered as a unit
 * test in `guide-target.test.ts` instead, not here. Confirmed empirically
 * against this exact harness: jsdom's `querySelectorAll` does not sort a
 * grouped selector's matches into document order when mixing a tag-name
 * clause (`button:not(:disabled)`, which every rail tab matches regardless
 * of its own tabindex) with an attribute clause (`[tabindex="0"]`, which only
 * the tablist and the CURRENT tab stop match) - it returns every tag-name
 * match ahead of every attribute-only match, tree position aside. So
 * `firstReachable` sees the six rail tabs before the tablist container no
 * matter which is actually first in the tree, and returns the first tab in
 * declaration order (Presets) rather than reaching the tablist branch at
 * all - a jsdom engine artifact, not a `firstReachable` defect: a real
 * browser sorts the same grouped selector by true document order. Reported
 * back rather than asserted here, since a panel-level desktop case would be
 * unreliable in this environment for a reason that has nothing to do with
 * the code under test.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LayoutSettingsPanel } from "@/components/settings/panels/layout-settings-panel";
import { focusGuideTarget } from "@/components/onboarding/guide-target";
import {
  DEFAULT_LAYOUT_SNAPSHOT,
  useLayoutStore,
} from "@/stores/layout/layout-store";

vi.mock("@/lib/host", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/host")>()),
  useHostClient: () => null,
}));
vi.mock("@/components/layout-editor/inspector/provider-limit-windows", () => ({
  useProviderLimitWindows: () => ({ windows: [], drawnKeys: [] }),
}));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useNavigate: () => vi.fn(),
}));

/**
 * Models a breakpoint's `md:hidden` / `hidden md:flex` pair the way real CSS
 * would answer `checkVisibility()`, which jsdom does not implement at all.
 * `hideSelector` names the ancestor whose descendants this breakpoint does
 * not draw.
 */
function stubCheckVisibility(hideSelector: string): () => void {
  const prototype = HTMLElement.prototype as {
    checkVisibility?: (this: HTMLElement) => boolean;
  };
  const original = prototype.checkVisibility;
  prototype.checkVisibility = function (this: HTMLElement): boolean {
    return this.closest(hideSelector) === null;
  };
  return () => {
    if (original === undefined) {
      delete prototype.checkVisibility;
    } else {
      prototype.checkVisibility = original;
    }
  };
}

afterEach(() => {
  cleanup();
  useLayoutStore.setState({ ...DEFAULT_LAYOUT_SNAPSHOT });
});

describe("focusGuideTarget on the Layout areas root (review H2)", () => {
  it("lands on the Layout area select trigger when the rail is the breakpoint not drawn", () => {
    render(<LayoutSettingsPanel />);
    // The rail nav is the breakpoint this stub withholds - a phone, where
    // `SettingsMasterDetail`'s `<nav>` carries `hidden md:flex`.
    const restore = stubCheckVisibility("nav");
    try {
      const root = document.querySelector("[data-layout-areas]") as HTMLElement;
      expect(focusGuideTarget(root)).toBe(true);
      expect(document.activeElement).toBe(
        screen.getByRole("combobox", { name: "Layout area" }),
      );
    } finally {
      restore();
    }
  });
});
