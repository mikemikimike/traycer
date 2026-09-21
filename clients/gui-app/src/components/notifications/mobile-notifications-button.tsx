import { type ReactNode } from "react";
import { Bell } from "lucide-react";
import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import { Button } from "@/components/ui/button";
import { RollingNumber } from "@/components/ui/rolling-number";
import {
  Analytics,
  AnalyticsEvent,
  analyticsCountBucket,
} from "@/lib/analytics";
import { useMotionEnabled } from "@/lib/animation/use-motion-enabled";
import { cn } from "@/lib/utils";
import {
  notificationBellAccessibleLabel,
  useMergedNotificationUnreadCount,
  useNotificationBellState,
  useNotificationCenterHostState,
} from "@/stores/notifications/merged-notifications";
import { useNotificationsPopoverStore } from "@/stores/notifications/notifications-popover-store";

/**
 * The same arrival the desktop bell's badge uses, at the `LeaderDigitBadge`
 * values, with the origin on the corner that overlaps the glyph so the badge
 * grows out of the bell rather than out of the page.
 */
const BADGE_HIDDEN = { opacity: 0, scale: 0.9 } as const;
const BADGE_PRESENT = { opacity: 1, scale: 1 } as const;
const BADGE_TRANSITION = { duration: 0.14, ease: "easeOut" } as const;

/** Above this the badge prints `99+`, which is not a number and does not roll. */
const BADGE_COUNT_CAP = 99;

/**
 * One count badge, at whichever of the two tones the state asks for. Both wear
 * the same box and the same arrival; only the fill and the count differ, and
 * writing the motion twice is how the two drift apart.
 */
function MobileCountBadge(props: {
  readonly count: number;
  readonly testId: string;
  readonly countTestId: string;
  readonly toneClassName: string;
  readonly motionEnabled: boolean;
}): ReactNode {
  return (
    <m.span
      data-testid={props.testId}
      aria-hidden
      initial={props.motionEnabled ? BADGE_HIDDEN : false}
      animate={BADGE_PRESENT}
      exit={props.motionEnabled ? BADGE_HIDDEN : undefined}
      transition={BADGE_TRANSITION}
      className={cn(
        "absolute -right-1 -top-1 flex h-4 min-w-4 origin-bottom-left items-center justify-center rounded-md px-1 text-overline font-semibold leading-none tabular-nums shadow-sm ring-2 ring-background",
        props.toneClassName,
      )}
    >
      {props.count > BADGE_COUNT_CAP ? (
        `${BADGE_COUNT_CAP}+`
      ) : (
        <RollingNumber
          value={props.count}
          format={undefined}
          className={undefined}
          testId={props.countTestId}
        />
      )}
    </m.span>
  );
}

/**
 * Notifications trigger for the phone header, sitting alongside the other
 * global status controls. The desktop `NotificationsBell` owns an anchored
 * Radix popover; on mobile the center is the full-screen
 * `NotificationsMobileSheet` driven by the same store, so this is a plain
 * button that flips it open.
 */
export function MobileNotificationsButton(): ReactNode {
  const setOpen = useNotificationsPopoverStore((state) => state.setOpen);
  const unread = useMergedNotificationUnreadCount();
  const bellState = useNotificationBellState();
  const hostState = useNotificationCenterHostState();
  const motionEnabled = useMotionEnabled();
  const showsUnreadBadge = bellState.kind === "quietDot" && unread > 0;

  const handleOpen = () => {
    // Mirror the desktop bell's open telemetry (notifications-bell.tsx). That
    // bell isn't mounted on mobile, so its edge-triggered open effect never
    // fires - this button is the sole open path here, and it's a direct UI
    // interaction, hence entry_point "direct_ui".
    const attentionCount = bellState.kind === "attention" ? bellState.count : 0;
    Analytics.getInstance().track(AnalyticsEvent.NotificationCenterOpened, {
      entry_point: "direct_ui",
      host_state: hostState.isPartial ? "unknown" : "exact",
      attention_bucket:
        bellState.kind === "unknown"
          ? "unknown"
          : analyticsCountBucket(attentionCount),
      unread_bucket:
        bellState.kind === "unknown" ? "unknown" : analyticsCountBucket(unread),
    });
    setOpen(true);
  };

  return (
    <Button
      type="button"
      variant="muted"
      size="icon-sm"
      aria-label={notificationBellAccessibleLabel(bellState)}
      data-testid="mobile-notifications-button"
      className="relative shrink-0"
      onClick={handleOpen}
    >
      <Bell className="size-4" aria-hidden />
      <AnimatePresence initial={false}>
        {bellState.kind === "attention" ? (
          <MobileCountBadge
            key="attention"
            count={bellState.count}
            testId="mobile-notifications-attention-badge"
            countTestId="mobile-notifications-attention-count"
            toneClassName="bg-destructive text-destructive-foreground"
            motionEnabled={motionEnabled}
          />
        ) : null}
      </AnimatePresence>
      {/* Unlike the desktop bell's quiet dot, show the unread count - this is
          the only notifications surface on phones, so the count carries real
          signal here. Dot only when the merged count hasn't resolved to a
          number yet. */}
      <AnimatePresence initial={false}>
        {showsUnreadBadge ? (
          <MobileCountBadge
            key="unread"
            count={unread}
            testId="mobile-notifications-unread-badge"
            countTestId="mobile-notifications-unread-count"
            toneClassName="bg-primary text-primary-foreground"
            motionEnabled={motionEnabled}
          />
        ) : null}
      </AnimatePresence>
      {bellState.kind === "quietDot" && unread === 0 && (
        <span
          data-testid="mobile-notifications-quiet-dot"
          aria-hidden
          className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-primary ring-2 ring-background"
        />
      )}
    </Button>
  );
}
