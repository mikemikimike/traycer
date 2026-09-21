import type { MouseEvent, ReactNode } from "react";
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { LayoutRegionMenuItems } from "@/components/layout-editor/region-quick-verbs";
import { useIsMobileViewport } from "@/hooks/ui/use-mobile-viewport";
import { trackSettingChanged } from "@/lib/analytics";
import { useArrangementValue, useRegionShown } from "@/lib/layout-overrides";
import type { RateLimitProviderId } from "@/lib/rate-limit-providers";
import { useLayoutStore } from "@/stores/layout/layout-store";

/**
 * Marks a subtree the status bar's own right-click menu must not claim. The bar
 * is one strip of small controls that own their own menus and pointer
 * behaviour - the two panel triggers and the host notice's way out - and a menu
 * anchored on the whole bar would otherwise swallow theirs.
 */
export const STATUS_BAR_MENU_EXEMPT_ATTRIBUTE = "data-status-bar-menu-exempt";

export interface StatusBarMenuProvider {
  readonly providerId: RateLimitProviderId;
  readonly label: string;
}

interface StatusBarVisibilityMenuProps {
  /**
   * The providers the bar can currently show, in the order it shows them.
   * Passed in rather than resolved here: the bar has already resolved its
   * watched host's provider list, and a menu that resolved its own could name
   * a different set than the segments beside it.
   */
  readonly providers: ReadonlyArray<StatusBarMenuProvider>;
  /** The bar itself - the region a right-click opens this menu over. */
  readonly children: ReactNode;
}

/**
 * The status bar's quick-visibility menu: what each segment shows, without a
 * trip to Settings, plus the way to that page for everything else.
 *
 * Every item writes the same layout store the editor writes, so the two can
 * never disagree - this is a second view onto those values, never a second
 * place they live.
 */
export function StatusBarVisibilityMenu(
  props: StatusBarVisibilityMenuProps,
): ReactNode {
  const hiddenProviders = useArrangementValue("hiddenProviders");
  const resourcesShown = useRegionShown("resourceMonitor");
  const setArrangement = useLayoutStore((state) => state.setArrangement);
  const setRegionValues = useLayoutStore((state) => state.setRegionValues);
  // Below `md` the shell answers with `mobileFooter` and ignores `usageHost`
  // entirely, while `MobileAppHeader` draws its usage controls whatever
  // `usageHost` says. So the item would write a value that moves nothing, and
  // leave it waiting for the next desktop window.
  const narrowViewport = useIsMobileViewport();

  return (
    <ContextMenu>
      <ContextMenuTrigger
        asChild
        onContextMenu={(event: MouseEvent<HTMLElement>) => {
          // Radix composes this ahead of its own opener and skips that opener
          // once the event is defaulted-prevented, so an exempt subtree keeps
          // whatever menu (or none) it owns.
          if (
            event.target instanceof Element &&
            event.target.closest(`[${STATUS_BAR_MENU_EXEMPT_ATTRIBUTE}]`) !==
              null
          ) {
            event.preventDefault();
          }
        }}
      >
        {props.children}
      </ContextMenuTrigger>
      <ContextMenuContent>
        {props.providers.map((provider) => (
          <ContextMenuCheckboxItem
            key={provider.providerId}
            checked={!hiddenProviders.includes(provider.providerId)}
            onCheckedChange={() => {
              trackSettingChanged(
                "layout",
                "layout.statusBar.rateLimits.provider",
              );
              // The whole arrangement is read at write time rather than
              // subscribed: this menu needs it only to spread it (G1-14).
              setArrangement({
                ...useLayoutStore.getState().arrangement,
                hiddenProviders: hiddenProviders.includes(provider.providerId)
                  ? hiddenProviders.filter((id) => id !== provider.providerId)
                  : [...hiddenProviders, provider.providerId],
              });
            }}
          >
            {provider.label}
          </ContextMenuCheckboxItem>
        ))}
        <ContextMenuCheckboxItem
          checked={resourcesShown}
          onCheckedChange={(checked) => {
            trackSettingChanged("layout", "layout.statusBar.resources.enabled");
            setRegionValues("resourceMonitor", {
              shown: checked ? "shown" : "hidden",
            });
          }}
        >
          Resource monitor
        </ContextMenuCheckboxItem>
        {narrowViewport ? null : (
          <ContextMenuItem
            onSelect={() => {
              trackSettingChanged("layout", "layout.statusBar.placement");
              setArrangement({
                ...useLayoutStore.getState().arrangement,
                usageHost: "header",
              });
            }}
          >
            Move to header
          </ContextMenuItem>
        )}
        <ContextMenuSeparator />
        {/* The bar's own quick verbs and the way in (L-19). The items above are
            one per segment; what these add is the region this menu is anchored
            on and "Customize layout...", which replaces the old jump to the
            Layout settings page - customizing is the editor's job now, and the
            door lands on that page by itself when the window is too narrow. */}
        <LayoutRegionMenuItems regionId="usageLimits" />
      </ContextMenuContent>
    </ContextMenu>
  );
}
