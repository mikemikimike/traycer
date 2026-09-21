import { LAYOUT_MEMBER_ATTRIBUTE } from "@/components/layout-editor/canvas/region-drag";
import { useLayoutEditorStore } from "@/stores/layout/layout-editor-store";
import { cn } from "@/lib/utils";

/**
 * A group boundary in the icon rail, as a real element (L-25, L-115).
 *
 * One component for both rails - the epic sidebar's and the sample
 * workspace's - because it draws the same fact about `arrangement.rail` in
 * both, and because in an editor session it is the thing the user grabs: a
 * canvas drop reorders the rail's ENTRIES, and a divider is an entry.
 *
 * It is a member of the rail's order without being a region, so it carries the
 * member id the drop places by rather than a `data-layout-region`, and it
 * carries it only while a session is live - exactly the lifetime
 * `useLayoutRegion` gives a region's DRAG attributes (`data-layout-group`,
 * `data-layout-draggable`), so the rail's markup at rest is the same with the
 * editor installed as without it. A region's NAME outlives the session (L-129);
 * a divider has none to outlive it with, which is why there is nothing here
 * that the app at rest can see.
 */
export function LeftPanelRailDivider(props: {
  readonly dividerId: string;
  readonly orientation: "vertical" | "horizontal";
}) {
  const { dividerId, orientation } = props;
  const editing = useLayoutEditorStore((state) => state.session !== null);
  const memberProps: Record<string, string> = editing
    ? {
        [LAYOUT_MEMBER_ATTRIBUTE]: dividerId,
        "data-layout-group": "rail",
        "data-layout-draggable": "1",
      }
    : {};
  return (
    <div
      aria-hidden
      data-testid="epic-rail-divider"
      {...memberProps}
      // No grab cursor here: `layout-editor.css` puts it on every
      // `[data-layout-draggable]` inside an editing column, which is the one
      // place a region's own grab cursor comes from too.
      className={cn(
        "flex shrink-0 items-center justify-center",
        orientation === "vertical" ? "h-2 w-full" : "h-full w-2",
      )}
    >
      <span
        className={cn(
          "rounded-full bg-border",
          orientation === "vertical" ? "h-px w-5" : "h-5 w-px",
        )}
      />
    </div>
  );
}
