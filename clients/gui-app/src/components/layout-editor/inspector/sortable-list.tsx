import {
  useEffect,
  useId,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { Eye, EyeOff, GripVertical, X, type LucideIcon } from "lucide-react";
import { armLayoutDrag } from "@/components/layout-editor/canvas/drag-engine";
import { Button } from "@/components/ui/button";
import { movedWithin } from "@/lib/layout/layout-arrangement";
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
  /** Taking the item out of the list altogether: a rail divider, and only that. */
  readonly onRemove: (() => void) | null;
  /** Opening a second level (the usage-providers row's own breadcrumb screen). */
  readonly onActivate: (() => void) | null;
}

interface SortableListProps<Id extends string> {
  readonly items: ReadonlyArray<SortableListItem<Id>>;
  readonly selectedId: string | null;
  /** One item's new index in this list. The caller writes it as one gesture. */
  readonly onMove: (id: Id, toIndex: number) => void;
}

/** The operation every row carries, stated on the row rather than on the grab. */
const GRAB_INSTRUCTIONS =
  "Press space to pick up, arrow keys to move, space to drop, escape to cancel.";

/** Where a grabbed item started, and where the arrows have taken it so far. */
interface KeyboardGrab<Id extends string> {
  readonly id: Id;
  readonly from: number;
  readonly to: number;
}

/**
 * The Position row's sortable sibling list (L-24): `.sortlist` / `.sitem` in
 * the prototype, and the keyboard path for every reorder the canvas offers a
 * pointer.
 *
 * Three ways to move an item, all landing on the same one-index-at-a-time
 * write:
 *
 * - a pointer drag on the same engine the canvas uses, so the two feel alike;
 * - Alt+ArrowUp/Down, which nudges by one and commits at once (L-31);
 * - Space to grab, arrows to move, Space to drop and Escape to put it back,
 *   which is the path that works without a pointer and without knowing the
 *   modifier. The grab moves nothing until it is dropped, exactly as the drag
 *   writes nothing until the release, and it is never animated - a bounce
 *   belongs to a gesture that carried momentum, and a key press carries none
 *   (L-29).
 */
export function SortableList<Id extends string>(
  props: SortableListProps<Id>,
): ReactNode {
  const { items, selectedId, onMove } = props;
  const listRef = useRef<HTMLDivElement | null>(null);
  const instructionsId = useId();
  const [grab, setGrab] = useState<KeyboardGrab<Id> | null>(null);
  const [announcement, setAnnouncement] = useState("");

  // While an item is grabbed the list draws where it WOULD land. Nothing is
  // written until the drop, so Escape is a true cancel and the whole move is
  // one history entry however many arrow presses it took.
  const shown = grab === null ? items : movedWithin(items, grab.from, grab.to);

  function cancelGrab(current: KeyboardGrab<Id>, label: string): void {
    setGrab(null);
    setAnnouncement(
      positionMessage("Cancelled, returned", label, current.from, items.length),
    );
  }

  /**
   * Both gestures are bound on the list natively rather than as props on each
   * row, and Escape is why.
   *
   * The editor's own ladder listens natively on the inspector shell (5.3),
   * which is an ANCESTOR; a React handler is delegated at the ROOT, above the
   * shell, so it would run only after the ladder had already walked back. A
   * native listener on this container runs while the event is still on its way
   * up, which is what lets a cancelled grab be a rung of its own. Click
   * follows keydown here so that the two read together and so the row keeps
   * its keyboard operation without an `onClick` prop that has no `onKeyDown`
   * beside it.
   */
  useEffect(() => {
    const list = listRef.current;
    if (list === null) return;

    function rowItem(
      event: Event,
    ): { item: SortableListItem<Id>; index: number } | null {
      const target = event.target;
      if (!(target instanceof Element)) return null;
      // A control in the row is a control, not the row.
      if (target.closest("button") !== null) return null;
      const id = target
        .closest("[data-sortable-id]")
        ?.getAttribute("data-sortable-id");
      const index = items.findIndex((candidate) => candidate.id === id);
      if (index < 0) return null;
      return { item: items[index], index };
    }

    function announce(verb: string, label: string, index: number): void {
      setAnnouncement(positionMessage(verb, label, index, items.length));
    }

    function handleSpace(item: SortableListItem<Id>, index: number): void {
      if (grab === null) {
        setGrab({ id: item.id, from: index, to: index });
        // What to do next is on the row already (`GRAB_INSTRUCTIONS`), so the
        // grab only has to say what happened.
        announce("Grabbed", item.label, index);
        return;
      }
      setGrab(null);
      announce("Dropped", item.label, grab.to);
      if (grab.to !== grab.from) onMove(grab.id, grab.to);
    }

    function handleArrow(
      item: SortableListItem<Id>,
      index: number,
      delta: number,
    ): void {
      const last = items.length - 1;
      if (grab !== null) {
        const to = Math.min(Math.max(grab.to + delta, 0), last);
        if (to === grab.to) return;
        setGrab({ ...grab, to });
        announce("Moved", item.label, to);
        return;
      }
      const to = Math.min(Math.max(index + delta, 0), last);
      if (to === index) return;
      announce("Moved", item.label, to);
      onMove(item.id, to);
    }

    function handleKeyDown(event: KeyboardEvent): void {
      const row = rowItem(event);
      if (row === null) return;
      if (grab !== null && grab.id !== row.item.id) return;
      const arrow = arrowDelta(event.key);
      if (event.key === " ") {
        event.preventDefault();
        handleSpace(row.item, row.index);
      } else if (event.key === "Escape" && grab !== null) {
        event.preventDefault();
        event.stopPropagation();
        cancelGrab(grab, row.item.label);
      } else if (arrow !== null && (grab !== null || event.altKey)) {
        // Without a grab the arrows belong to the index's own walk unless the
        // modifier L-31 names is held.
        event.preventDefault();
        handleArrow(row.item, row.index, arrow);
      }
    }

    function handleClick(event: MouseEvent): void {
      if (grab !== null) return;
      rowItem(event)?.item.onActivate?.();
    }

    list.addEventListener("keydown", handleKeyDown);
    list.addEventListener("click", handleClick);
    return () => {
      list.removeEventListener("keydown", handleKeyDown);
      list.removeEventListener("click", handleClick);
    };
  });

  function handlePointerDown(
    event: ReactPointerEvent<HTMLDivElement>,
    id: Id,
  ): void {
    if (grab !== null) return;
    // A control in the row is a control, not a handle.
    if (
      event.target instanceof Element &&
      event.target.closest("button") !== null
    )
      return;
    armLayoutDrag({
      event: event.nativeEvent,
      onFrame: null,
      resolve: () => {
        const rows = rowsOf(listRef.current);
        const index = rows.findIndex(
          (node) => node.getAttribute("data-sortable-id") === id,
        );
        return index < 0 ? null : { items: rows, index, clamp: null };
      },
      onDrop: (_fromIndex, toIndex) => {
        onMove(id, toIndex);
      },
    });
  }

  return (
    <>
      {/* Said before it is needed, not after: the instructions used to reach a
          screen reader only once Space had already been pressed, which left
          every row announced as an unnamed focusable group with no stated
          operation (G3-18). One static line, described by every row. */}
      <p id={instructionsId} className="sr-only">
        {GRAB_INSTRUCTIONS}
      </p>
      <div ref={listRef} className="flex flex-col gap-1">
        {shown.map((item) => (
          <div
            key={item.id}
            data-sortable-id={item.id}
            data-grabbed={grab?.id === item.id ? "1" : undefined}
            // Every row, not only the ones that open a second level: a row
            // that can be focused, grabbed and moved has an operation whether
            // or not it also has a destination.
            role="button"
            aria-describedby={instructionsId}
            tabIndex={0}
            className={cn(
              "flex touch-none items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 text-ui-sm",
              item.id === selectedId && "border-foreground",
              item.shown !== true && "text-muted-foreground",
            )}
            onPointerDown={(event) => {
              handlePointerDown(event, item.id);
            }}
            onBlur={() => {
              // A grab that outlived the focus it was made with would keep
              // swallowing arrows for a row nobody is on.
              if (grab !== null && grab.id === item.id)
                cancelGrab(grab, item.label);
            }}
          >
            <GripVertical
              aria-hidden
              className="size-3.5 shrink-0 cursor-grab text-muted-foreground"
            />
            {item.icon ? (
              <item.icon className="size-3.5 shrink-0 text-muted-foreground" />
            ) : null}
            {/* A divider IS a line, so its row draws one where a panel's name
              would keep going: the list reads the way the rail does. */}
            {item.shown === null ? (
              <>
                <span className="shrink-0">{item.label}</span>
                <span aria-hidden className="h-px flex-1 bg-border" />
              </>
            ) : (
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
            )}
            {item.onRemove === null ? null : (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={`Remove ${item.label.toLowerCase()}`}
                onClick={(event) => {
                  event.stopPropagation();
                  item.onRemove?.();
                }}
              >
                <X />
              </Button>
            )}
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
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </>
  );
}

function arrowDelta(key: string): number | null {
  if (key === "ArrowUp") return -1;
  if (key === "ArrowDown") return 1;
  return null;
}

function positionMessage(
  verb: string,
  label: string,
  index: number,
  total: number,
): string {
  return `${verb} ${label}, position ${String(index + 1)} of ${String(total)}.`;
}

function rowsOf(list: HTMLDivElement | null): ReadonlyArray<HTMLElement> {
  if (list === null) return [];
  return [...list.querySelectorAll<HTMLElement>("[data-sortable-id]")];
}
