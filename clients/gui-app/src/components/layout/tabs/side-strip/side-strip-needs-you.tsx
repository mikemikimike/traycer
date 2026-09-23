import { useCallback, type ReactNode } from "react";
import { NeedsYouItem } from "@/components/notifications/needs-you-item";
import { useNotificationActivation } from "@/hooks/notifications/use-notification-activation";
import { activationResultHandler } from "@/lib/notifications/notification-activation-result";
import { cn } from "@/lib/utils";
import {
  useMergedNotificationsActions,
  type MergedNotificationRow,
} from "@/stores/notifications/merged-notifications";
import { useNeedsYouItems } from "@/stores/notifications/needs-you-items";
import { useLiveAgentsInStrip } from "./live-agents-slot-store";
import { SIDE_STRIP_SECTION_LABEL_CLASS } from "./side-strip-tokens";

/**
 * The Activity view's Needs you block (D10, D13), pinned under the nav rows:
 * the same items as the Inbox's Needs you group, from the same selector, and
 * only while there is one. A row opens its chat on the pending card through
 * the notification's own activation; nothing is approved or answered here.
 */
export function SideStripNeedsYou(): ReactNode {
  const shown = useLiveAgentsInStrip();
  const items = useNeedsYouItems();
  const activate = useNeedsYouActivation();
  if (!shown || items.length === 0) return null;
  return (
    <section aria-label="Needs you" data-testid="side-strip-needs-you">
      <div
        className={cn(
          SIDE_STRIP_SECTION_LABEL_CLASS,
          "flex items-center text-muted-foreground",
        )}
      >
        <span className="min-w-0 flex-1">Needs you</span>
        <span className="tabular-nums">{items.length}</span>
      </div>
      {/* Capped, so a long queue scrolls here and never pushes the tabs away. */}
      <div className="no-scrollbar flex max-h-[40vh] flex-col overflow-y-auto [-webkit-app-region:no-drag]">
        {items.map((item) => (
          <NeedsYouItem
            key={item.row.feedId}
            item={item}
            onActivate={activate}
          />
        ))}
      </div>
    </section>
  );
}

function useNeedsYouActivation(): (row: MergedNotificationRow) => void {
  const { activate } = useNotificationActivation();
  const { markAsRead } = useMergedNotificationsActions();
  return useCallback(
    (row: MergedNotificationRow) => {
      if (row.payload === null) return;
      activate({
        payload: row.payload,
        receivedAt: Date.now(),
        feedId: row.feedId,
        originHostId: row.originHostId,
        onResult: activationResultHandler({
          row,
          feedId: row.feedId,
          surface: "strip",
          markAsRead,
          onSuccess: null,
        }),
      });
    },
    [activate, markAsRead],
  );
}
