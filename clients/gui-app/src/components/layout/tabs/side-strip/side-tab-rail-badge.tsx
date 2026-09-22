import type { ReactNode } from "react";
import { AgentSpinningDots } from "@/components/ui/agent-spinning-dots";
import {
  APPROVAL_TONE,
  DONE_TONE,
  FAILURE_TONE,
} from "@/components/notifications/notification-indicator-tones";
import { cn } from "@/lib/utils";
import { SIDE_TAB_BADGE_CLASS } from "./side-strip-tokens";
import type { RailBadgeKind } from "./rail-badge-kind";

const RAIL_BADGE_TONE: Readonly<
  Record<
    Exclude<RailBadgeKind, "running">,
    { className: string; label: string }
  >
> = {
  waiting: { className: APPROVAL_TONE.className, label: "Waiting for you" },
  failed: { className: FAILURE_TONE.className, label: FAILURE_TONE.title },
  "unread-done": { className: DONE_TONE.className, label: DONE_TONE.title },
};

/**
 * The 10px badge, ringed in the canvas colour so it reads as cut out of the
 * tile it sits on. Status hues come from the notification tone registry and
 * fill the dot through `currentColor`; running is the muted spinner.
 */
export function SideTabRailBadge(props: {
  readonly kind: RailBadgeKind;
  readonly testId: string;
}): ReactNode {
  if (props.kind === "running") {
    return (
      <span
        role="img"
        aria-label="Task activity in progress"
        data-testid={props.testId}
        data-kind={props.kind}
        className={cn(
          SIDE_TAB_BADGE_CLASS,
          "flex items-center justify-center overflow-hidden rounded-full bg-canvas",
        )}
      >
        <AgentSpinningDots
          className="size-2.5 min-w-2.5"
          testId={undefined}
          variant={undefined}
          tone="muted"
        />
      </span>
    );
  }
  const tone = RAIL_BADGE_TONE[props.kind];
  return (
    <span
      role="img"
      aria-label={tone.label}
      data-testid={props.testId}
      data-kind={props.kind}
      className={cn(
        SIDE_TAB_BADGE_CLASS,
        "block rounded-full bg-current",
        tone.className,
      )}
    />
  );
}
