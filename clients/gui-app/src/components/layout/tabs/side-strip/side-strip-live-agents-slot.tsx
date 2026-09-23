import { useCallback, type ReactNode } from "react";
import type { HeaderTab } from "@/stores/tabs/types";
import {
  publishLiveAgentsSlot,
  useLiveAgentsInStrip,
} from "./live-agents-slot-store";

/**
 * The empty element under the active task row that its epic surface portals
 * the live agents list into (D9). Drawn only for an active epic tab while the
 * strip lists live agents; other rows have no session, so they never expand.
 */
export function SideStripLiveAgentsSlot(props: {
  readonly tab: HeaderTab | null;
  readonly active: boolean;
}): ReactNode {
  const shown = useLiveAgentsInStrip();
  if (!shown || !props.active || props.tab?.kind !== "epic") return null;
  return <LiveAgentsSlotElement tabId={props.tab.id} />;
}

function LiveAgentsSlotElement(props: { readonly tabId: string }): ReactNode {
  const { tabId } = props;
  const ref = useCallback(
    // React 19 calls the returned cleanup in place of a `null` call.
    (element: HTMLDivElement | null) =>
      element === null ? undefined : publishLiveAgentsSlot(tabId, element),
    [tabId],
  );
  return <div ref={ref} data-testid="side-strip-live-agents-slot" />;
}
