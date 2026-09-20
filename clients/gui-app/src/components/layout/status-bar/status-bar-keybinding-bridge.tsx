import { useEffect, type ReactNode } from "react";
import { trackSettingChanged } from "@/lib/analytics";
import { ACTION_META } from "@/lib/keybindings/actions";
import { registerDynamicActionHandler } from "@/lib/keybindings/dispatch";
import { isMobileApp } from "@/lib/mobile-app";
import { useLayoutStore } from "@/stores/layout/layout-store";

/**
 * Registers the placement toggle with the keybinding registry.
 *
 * Mounted app-wide rather than by the status bar itself: the action moves the
 * usage controls BETWEEN the header and the bar, so a handler owned by the bar
 * would exist only in the one placement it can move away from, and the command
 * would go missing exactly when it is the way back.
 *
 * The build gate lives here rather than at the mount site, so that BOTH halves
 * of `desktopOnly` follow from the flag itself: the palette drops the row by
 * reading it (`actions.source.ts`) and the handler goes unregistered by reading
 * it here. A shell that hard-coded `isMobileApp()` instead would keep
 * registering handlers for the next `desktopOnly` action someone adds.
 */
export function StatusBarKeybindingBridge(): ReactNode {
  const setArrangement = useLayoutStore((state) => state.setArrangement);
  useEffect(() => {
    if (ACTION_META["app.status-bar.toggle"].desktopOnly && isMobileApp()) {
      return undefined;
    }
    return registerDynamicActionHandler("app.status-bar.toggle", () => {
      // Read at invocation, not at registration: the handler is registered
      // once and the arrangement changes underneath it.
      const arrangement = useLayoutStore.getState().arrangement;
      trackSettingChanged("layout", "layout.statusBar.placement");
      setArrangement({
        ...arrangement,
        usageHost:
          arrangement.usageHost === "status-bar" ? "header" : "status-bar",
      });
    });
  }, [setArrangement]);
  return null;
}
