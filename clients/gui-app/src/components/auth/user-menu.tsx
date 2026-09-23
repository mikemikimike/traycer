import { useColumnOverlayPlacement } from "@/components/layout/column-edge-context";
import { SignOutConfirmDialog } from "@/components/auth/sign-out-confirm-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import { computeInitials } from "@/lib/auth/compute-initials";
import { resolvePlatformBaseUrl } from "@/lib/auth/platform-base-url";
import { useRunnerHost } from "@/providers/use-runner-host";
import { useTitleBarDragSuppression } from "@/stores/layout/title-bar-drag-store";
import { getSystemTabModalApi } from "@/stores/tabs/system-tab-modal-bridge";
import { useDesktopDialogStore } from "@/stores/dialogs/desktop-dialog-store";
import { ExternalLink, LayersPlus, LogOut, Settings } from "lucide-react";
import { useState, type ReactElement } from "react";
import { Analytics, AnalyticsEvent } from "@/lib/analytics";
import { formatChordForDisplay } from "@/lib/keybindings/chord";
import { ignoreError } from "@/lib/browser-view/ignore-error";
import { useOpenLink } from "@/lib/links/open-link";
import { isMobileApp } from "@/lib/mobile-app";
import { useBindingForAction } from "@/stores/settings/keybinding-store";

export interface UserMenuProps {
  readonly userName: string;
  readonly email: string;
  readonly avatarUrl: string | null;
  readonly showAppSettings: boolean;
  /**
   * The element that opens the menu, or `null` for the avatar button. A custom
   * trigger (the strip foot's account row) must be one focusable element that
   * takes a ref; the menu toggles it open through Radix's own trigger.
   */
  readonly trigger: ReactElement | null;
}

/** The signed-in person's avatar: their picture, or their initials. */
export function UserMenuAvatar(props: {
  readonly userName: string;
  readonly email: string;
  readonly avatarUrl: string | null;
}) {
  return (
    <Avatar size="sm">
      {props.avatarUrl !== null ? (
        <AvatarImage src={props.avatarUrl} alt="" />
      ) : null}
      <AvatarFallback>
        {computeInitials(props.userName, props.email)}
      </AvatarFallback>
    </Avatar>
  );
}

/**
 * Avatar-triggered identity menu. Controlled open state is intentional:
 * jsdom doesn't implement the full PointerEvent path Radix drives, so
 * without the explicit `open` the Radix trigger wouldn't fire under
 * tests. Outside-click + Escape dismissal still come from Radix.
 */
export function UserMenu(props: UserMenuProps) {
  const placement = useColumnOverlayPlacement("foot");
  const runnerHost = useRunnerHost();
  const openLink = useOpenLink();
  const [open, setOpen] = useState<boolean>(false);
  const [signOutOpen, setSignOutOpen] = useState<boolean>(false);
  const settingsChord = useBindingForAction("app.settings.open");
  useTitleBarDragSuppression("user-menu", open);
  const manageSubscriptionUrl = resolvePlatformBaseUrl(runnerHost.signInUrl);
  return (
    <>
      {/* Outside the menu, which Radix unmounts on select - the confirm has to
          outlive the item that opened it. */}
      <SignOutConfirmDialog
        open={signOutOpen}
        onOpenChange={setSignOutOpen}
        onConfirm={() => {
          setOpen(false);
        }}
      />
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <TooltipWrapper
          label={open ? null : props.userName}
          side={placement?.side ?? "top"}
          sideOffset={6}
          align={placement?.align}
        >
          <DropdownMenuTrigger asChild>
            {props.trigger ?? (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Open user menu"
                // Non-editable chrome, dimmed while a layout session is live (4.2).
                data-layout-passive
                data-testid="user-menu-trigger"
                className="rounded-full"
                onClick={() => {
                  setOpen((value) => !value);
                }}
              >
                <UserMenuAvatar
                  userName={props.userName}
                  email={props.email}
                  avatarUrl={props.avatarUrl}
                />
              </Button>
            )}
          </DropdownMenuTrigger>
        </TooltipWrapper>
        <DropdownMenuContent
          side={placement?.side}
          align={placement?.align ?? "end"}
          sideOffset={6}
          className="w-max whitespace-nowrap"
          data-testid="user-menu-content"
        >
          <div
            className="flex flex-col gap-0.5 px-1.5 py-1"
            data-testid="user-menu-identity"
          >
            <span className="text-ui-sm font-medium text-foreground">
              {props.userName}
            </span>
            <span className="text-ui-xs text-muted-foreground">
              {props.email}
            </span>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              setOpen(false);
              useDesktopDialogStore.getState().openDrafts("menu");
            }}
          >
            <LayersPlus className="size-3.5" />
            Drafts
          </DropdownMenuItem>
          {props.showAppSettings ? (
            <DropdownMenuItem
              data-testid="user-menu-app-settings"
              onSelect={() => {
                setOpen(false);
                Analytics.getInstance().track(AnalyticsEvent.SettingsOpened, {
                  source: "direct_ui",
                  section: "general",
                });
                getSystemTabModalApi()?.openSettings({
                  section: null,
                  resetToGeneral: true,
                });
              }}
            >
              <Settings className="size-3.5" />
              App settings
              {settingsChord === null ? null : (
                <DropdownMenuShortcut>
                  {formatChordForDisplay(settingsChord)}
                </DropdownMenuShortcut>
              )}
            </DropdownMenuItem>
          ) : null}
          {/* Withheld in the installed mobile app: App Store guideline 3.1.1
              forbids linking out to a subscription that cannot be bought
              through Apple, and this item opens exactly that page. This menu
              does reach the phone - the mobile header only replaces the
              desktop one for the `app` variant, so `host-loading` renders
              `DesktopAppHeader`, identity menu included. Sign out and App
              settings are unaffected. */}
          {isMobileApp() ? null : (
            <DropdownMenuItem
              data-testid="user-menu-manage-subscription"
              onSelect={() => {
                setOpen(false);
                // Tracked on the RESOLVED open only: a failed OS handoff is not
                // a subscription-management visit (R11). The failure toast is
                // the link seam's, so the rejection is ignored here.
                void openLink(manageSubscriptionUrl, "account", null).then(
                  () =>
                    Analytics.getInstance().track(
                      AnalyticsEvent.SubscriptionManagementOpened,
                      { source: "direct_ui" },
                    ),
                  ignoreError,
                );
              }}
            >
              <ExternalLink className="size-3.5" />
              Manage subscription
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            data-testid="user-menu-sign-out"
            variant="destructive"
            onSelect={() => {
              setOpen(false);
              setSignOutOpen(true);
            }}
          >
            <LogOut className="size-3.5" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
