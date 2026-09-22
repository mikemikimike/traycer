import type { ReactNode } from "react";
import { AppUpdateHeaderButton } from "@/components/layout/header/app-update-button";
import {
  HeaderBarCluster,
  HeaderIdentity,
  HeaderNotificationsBell,
} from "@/components/layout/header/header-actions";
import { HistoryButton } from "@/components/layout/header/history-button";
import { cn } from "@/lib/utils";
import type { SideTabRowVariant } from "./side-tab-row";
import { SIDE_STRIP_FOOT_CLASS } from "./side-strip-tokens";

/**
 * What trails in the header, in the strip (S-03): the update button, the
 * header-hosted readings (left cluster, then right), History, the bell and
 * identity. Only one of the header and the strip is ever mounted, so each
 * region's canvas node and each action registration stays single. A wrapping
 * row when expanded, one centred column in the rail; all of it no-drag.
 */
export function SideStripFoot(props: {
  readonly variant: SideTabRowVariant;
}): ReactNode {
  return (
    <div
      data-testid="side-strip-foot"
      className={cn(
        SIDE_STRIP_FOOT_CLASS,
        "flex shrink-0 [-webkit-app-region:no-drag]",
        props.variant === "collapsed"
          ? "flex-col items-center"
          : "flex-wrap items-center",
      )}
    >
      <AppUpdateHeaderButton />
      <HeaderBarCluster side="left" />
      <HeaderBarCluster side="right" />
      <HistoryButton />
      <HeaderNotificationsBell />
      <HeaderIdentity showAppSettings />
    </div>
  );
}
