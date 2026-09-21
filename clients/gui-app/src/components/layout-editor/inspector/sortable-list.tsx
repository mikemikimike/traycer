import type { KeyboardEvent, ReactNode } from "react";
import { Eye, EyeOff, GripVertical, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Generic in its id, so each order group passes its OWN union - region ids for
 * the dock and the toolbars, provider ids for the usage list, ids-or-divider
 * ids for the rail. A reorder therefore hands the caller back exactly the ids
 * it put in, and the re-narrowing helper that used to sit on the other side of
 * a widened `string` is gone (G1-23).
 */
export interface SortableListItem<Id extends string> {
  readonly id: Id;
  readonly label: string;
  readonly icon: LucideIcon | null;
  /** `null` for a divider, which carries no Shown state of its own. */
  readonly shown: boolean | null;
  /**
   * Bound per item rather than looked up from a list-level `(id) => void`:
   * the caller already knows each item's real (region or divider) identity
   * when it builds the list, so the click handler needs no string-keyed
   * re-derivation here.
   */
  readonly onToggleShown: (() => void) | null;
  /** Opening a second level (the usage-providers row's own breadcrumb screen). */
  readonly onActivate: (() => void) | null;
}

interface SortableListProps<Id extends string> {
  readonly items: ReadonlyArray<SortableListItem<Id>>;
  readonly selectedId: string | null;
  /** One Alt+Arrow step: the whole id list, reordered. */
  readonly onReorder: (ids: ReadonlyArray<Id>) => void;
}

/**
 * The Position row's sortable sibling list (L-24's keyboard path): `.sortlist`
 * / `.sitem` in the prototype. A plain list with drag handles rendered but
 * inert - the pointer drag engine is ticket 09's (C-17's overlap table puts
 * `inspector/sortable-list.tsx` on that ticket's row too, for exactly this
 * wiring) - while Alt+ArrowUp/Down reorders now, which is L-31's own keyboard
 * path and does not depend on the drag engine at all.
 */
export function SortableList<Id extends string>(
  props: SortableListProps<Id>,
): ReactNode {
  const { items, selectedId, onReorder } = props;

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>, id: Id): void {
    if (!event.altKey) return;
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    const ids = items.map((item) => item.id);
    const from = ids.indexOf(id);
    const to = Math.min(
      Math.max(from + (event.key === "ArrowUp" ? -1 : 1), 0),
      ids.length - 1,
    );
    if (to === from) return;
    const reordered = ids.slice();
    reordered.splice(to, 0, ...reordered.splice(from, 1));
    onReorder(reordered);
  }

  return (
    <div className="flex flex-col gap-1">
      {items.map((item) => (
        <div
          key={item.id}
          data-sortable-id={item.id}
          role={item.onActivate ? "button" : undefined}
          tabIndex={0}
          className={cn(
            "flex touch-none items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 text-ui-sm",
            item.id === selectedId && "border-foreground",
            item.shown === false && "text-muted-foreground",
          )}
          onClick={item.onActivate ?? undefined}
          onKeyDown={(event) => {
            handleKeyDown(event, item.id);
          }}
        >
          <GripVertical
            aria-hidden
            className="size-3.5 shrink-0 cursor-grab text-muted-foreground"
          />
          {item.icon ? (
            <item.icon className="size-3.5 shrink-0 text-muted-foreground" />
          ) : null}
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          {item.shown === null || item.onToggleShown === null ? null : (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-pressed={item.shown}
              aria-label={`${item.shown ? "Hide" : "Show"} ${item.label}`}
              onClick={(event) => {
                event.stopPropagation();
                item.onToggleShown?.();
              }}
            >
              {item.shown ? <Eye /> : <EyeOff />}
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}
