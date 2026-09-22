import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTabStripPlacement } from "@/components/layout/tabs/use-tab-strip-placement";
import {
  DEFAULT_ARRANGEMENT,
  type LayoutArrangement,
} from "@/lib/layout/layout-arrangement";
import { useLayoutStore } from "@/stores/layout/layout-store";

/**
 * `useTabStripPlacement` folds the stored arrangement pick together with the
 * mobile-header predicate it shares with `AppHeader` (S-11, S-12): mobile
 * always draws `top`, and a zoomed desktop window that keeps its native menu
 * row keeps its side strip.
 */

const mobileViewport = vi.hoisted(() => ({ value: false }));
const desktopMenus = vi.hoisted(() => ({ value: false }));

vi.mock("@/hooks/ui/use-mobile-viewport", () => ({
  useIsMobileViewport: () => mobileViewport.value,
  isMobileViewport: () => mobileViewport.value,
}));

vi.mock("@/components/layout/header/use-desktop-menu-bar-active", () => ({
  useDesktopMenuBarActive: () => desktopMenus.value,
}));

function setArrangement(patch: Partial<LayoutArrangement>): void {
  useLayoutStore.setState({
    arrangement: { ...DEFAULT_ARRANGEMENT, ...patch },
  });
}

describe("useTabStripPlacement", () => {
  beforeEach(() => {
    mobileViewport.value = false;
    desktopMenus.value = false;
    useLayoutStore.setState({ arrangement: DEFAULT_ARRANGEMENT });
  });
  afterEach(() => {
    cleanup();
  });

  it("returns the stored left placement on desktop", () => {
    setArrangement({ tabStripPlacement: "left" });

    const { result } = renderHook(() => useTabStripPlacement());

    expect(result.current).toBe("left");
  });

  it("returns top on a mobile viewport, whatever the stored placement is", () => {
    mobileViewport.value = true;
    setArrangement({ tabStripPlacement: "left" });

    const { result } = renderHook(() => useTabStripPlacement());

    expect(result.current).toBe("top");
  });

  it("returns the stored placement on a mobile-width window with desktop menus active", () => {
    mobileViewport.value = true;
    desktopMenus.value = true;
    setArrangement({ tabStripPlacement: "left" });

    const { result } = renderHook(() => useTabStripPlacement());

    expect(result.current).toBe("left");
  });
});
