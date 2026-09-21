import { LAYOUT_MEMBER_ATTRIBUTE } from "@/components/layout-editor/canvas/canvas-attributes";
import { cn } from "@/lib/utils";

/**
 * The handle a group boundary becomes while the user is customizing (L-140).
 *
 * "Group break" is what the user calls it; `divider` stays the code's word for
 * the entry, because the stored shape is `arrangement.rail`'s and renaming a
 * persisted kind buys nothing.
 *
 * At rest the boundary is NOT an element: the rail draws its groups with the
 * spacing it had before wave 2 and nothing between them, so a user who never
 * opens the editor sees the sidebar they had - no line, no box, no extra
 * scroll height (L-140, R3-04). Both rails therefore mount this only while
 * {@link useRailBreaksEditing} is true, which is why there is no gate inside
 * it: the component EXISTING is the gate, and the markers below are
 * unconditional.
 *
 * One component for both rails - the epic sidebar's and the sample
 * workspace's - because it draws the same fact about `arrangement.rail` in
 * both, and because in an editor session it is the thing the user grabs: a
 * canvas drop reorders the rail's ENTRIES, and a break is an entry.
 *
 * It is a member of the rail's order without being a region, so it carries the
 * member id the drop places by rather than a `data-layout-region`. A region's
 * NAME outlives the session (L-129); a break has none to outlive it with,
 * which is why there is nothing here that the app at rest can see.
 */
export function LeftPanelRailDivider(props: {
  readonly dividerId: string;
  readonly orientation: "vertical" | "horizontal";
}) {
  const { dividerId, orientation } = props;
  return (
    <div
      aria-hidden
      data-testid="epic-rail-divider"
      {...{ [LAYOUT_MEMBER_ATTRIBUTE]: dividerId }}
      data-layout-group="rail"
      data-layout-draggable="1"
      // No grab cursor here: `layout-editor.css` puts it on every
      // `[data-layout-draggable]` inside an editing column, which is the one
      // place a region's own grab cursor comes from too.
      className={cn(
        "flex shrink-0 items-center justify-center",
        orientation === "vertical" ? "h-2 w-full" : "h-full w-2",
      )}
    >
      {/* The prototype's `.rail-div i` at the app's own scale: a short rule,
        lit rather than hairline, so it reads as something to pick up next to
        the icons it separates. */}
      <span
        className={cn(
          "rounded-full bg-muted-foreground/50",
          orientation === "vertical" ? "h-0.5 w-5" : "h-5 w-0.5",
        )}
      />
    </div>
  );
}
