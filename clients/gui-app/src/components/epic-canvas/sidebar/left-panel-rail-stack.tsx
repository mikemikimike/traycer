import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A stacked pair on the rail: two icons inside one capsule (L-167).
 *
 * Both icons stay, so the rail always shows nine, and clicking either opens
 * the stack with that panel focused. What the capsule adds is the fact that
 * they belong together: one rounded surface behind both, so the pair reads as
 * ONE object at rest rather than as two buttons that happen to be adjacent.
 *
 * The seam between them is the rail's own `gap-1` again, drawn INSIDE the
 * capsule rather than as a gap between two of them. That is deliberate: the
 * rail is a `gap-1` column, so two icons a capsule joins sit exactly as far
 * apart as two icons it does not, the capsule does not push the icons below it
 * out of the rail's rhythm, and the only thing that changes is the surface
 * behind them and the hairline in the seam.
 *
 * Unlike a divider, the capsule carries no canvas MEMBER and answers no drag,
 * in a session or out of it. A divider is a member because a divider is placed
 * - the user decides where the gap goes. A link is not placed: it IS the pair
 * its id names (`rail.ts`), so dragging it out from between its two panels
 * leaves them adjacent and `normalizeRail` puts it straight back. Offering a
 * grab for a gesture that can only ever write the same rail would be an
 * affordance that does nothing. The gestures a stack really has are elsewhere:
 * dragging either ICON away breaks the join, the Position list's row removes
 * it, and the middle band of an icon makes one (L-168).
 *
 * One component for all three rails - the epic sidebar's, the sample
 * workspace's and the preset card's miniature - because it draws the same fact
 * about `arrangement.rail` in each.
 */
export function LeftPanelRailStack(props: {
  readonly stackId: string;
  readonly orientation: "vertical" | "horizontal";
  readonly first: ReactNode;
  readonly second: ReactNode;
}) {
  const { stackId, orientation, first, second } = props;
  const vertical = orientation === "vertical";
  return (
    <div
      data-rail-stack={stackId}
      data-testid="epic-rail-stack"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg bg-foreground/6",
        vertical ? "flex-col" : "flex-row",
      )}
    >
      {first}
      <span
        aria-hidden
        data-testid="epic-rail-stack-seam"
        className={cn(
          "pointer-events-none flex shrink-0 items-center justify-center",
          vertical ? "h-1 w-full" : "h-full w-1",
        )}
      >
        <span
          className={cn("bg-border/60", vertical ? "h-px w-5" : "h-5 w-px")}
        />
      </span>
      {second}
    </div>
  );
}
