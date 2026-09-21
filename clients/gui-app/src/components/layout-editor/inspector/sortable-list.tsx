import {
  useEffect,
  useId,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { ChevronRight, GripVertical, X, type LucideIcon } from "lucide-react";
import { armLayoutDrag } from "@/components/layout-editor/canvas/drag-engine";
import { useLayoutFormHost } from "@/components/layout-editor/inspector/layout-form-host";
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
  /** A group boundary (L-25) rather than a member: a rule, with no state. */
  readonly divider: boolean;
  /** Drawn muted: the member is hidden. */
  readonly dimmed: boolean;
  /** Differs from what shipped - the row's own changed dot (L-20, P-7). */
  readonly changed: boolean;
  /** The presence rule spelled out under the name (L-47), where one exists. */
  readonly hint: string | null;
  /**
   * The row's inline controls: its ONE Shown control, its Size where it has
   * one, and its revert. `null` in the dock, where the section header above
   * the list owns them and a second copy on the row would be D5 again.
   */
  readonly control: ReactNode;
  /** What this row's disclosure opens IN PLACE (L-89), or `null` for none. */
  readonly detail: ReactNode;
  readonly open: boolean;
  readonly onToggleOpen: (() => void) | null;
  /** Taking the item out of the list altogether: a rail divider, and only that. */
  readonly onRemove: (() => void) | null;
  /** Opening a second level as its own screen (the dock's provider level). */
  readonly onActivate: (() => void) | null;
}

interface SortableListProps<Id extends string> {
  readonly items: ReadonlyArray<SortableListItem<Id>>;
  readonly selectedId: string | null;
  /**
   * One item's new index in this list. The caller writes it as one gesture.
   *
   * `null` for a list with no order of its own - the Chat and Status bar cards
   * are two rows that cannot be rearranged - and then the rows carry no handle,
   * no grab and no reorder keys. One row component, drawn the same way whether
   * or not the list it is in happens to be ordered.
   */
  readonly onMove: ((id: Id, toIndex: number) => void) | null;
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
 * The layout form's one row list (L-24, L-95): the sortable siblings of the
 * Position row in the dock, and the surface card's whole body on the page.
 *
 * The two hosts differ by COMPOSITION and by nothing else. The page draws the
 * list with `selectedId: null` and a control slot on every row; the inspector
 * draws the SAME list for one region with `selectedId` on its row and the
 * controls in the section header above it. Neither has a row component of its
 * own (L-03).
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
  const host = useLayoutFormHost();
  const page = host === "page";
  const listRef = useRef<HTMLDivElement | null>(null);
  const instructionsId = useId();
  const [grab, setGrab] = useState<KeyboardGrab<Id> | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const ordered = onMove !== null;

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
   * A cancelled grab is a rung of the Escape ladder in its own right, and it
   * has to be settled before any ANCESTOR sees the key. Bound natively on the
   * list, it is settled at the deepest point there is and its
   * `stopPropagation` holds whatever else is listening above - the editor's
   * own ladder (now `document`, I-02), the shell, a future layer - without
   * depending on where React happens to delegate its handlers. Click
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
      // A control in the row is a control, not the row - and everything the
      // row's disclosure opened is the DETAIL's, not the row's. Without the
      // second test a space pressed on a checkbox label inside an expanded
      // card would pick the whole row up (L-95's in-place levels).
      if (target.closest("button") !== null) return null;
      if (target.closest(DETAIL_SELECTOR) !== null) return null;
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
      if (grab.to !== grab.from) onMove?.(grab.id, grab.to);
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
      onMove?.(item.id, to);
    }

    function handleKeyDown(event: KeyboardEvent): void {
      const row = rowItem(event);
      if (row === null) return;
      if (grab !== null && grab.id !== row.item.id) return;
      const arrow = arrowDelta(event.key);
      if (event.key === " " && !ordered) {
        // An unordered list has nothing to grab, so Space is the row's own
        // activation - the same thing Enter and a click do.
        event.preventDefault();
        activate(row.item);
      } else if (event.key === " ") {
        event.preventDefault();
        handleSpace(row.item, row.index);
      } else if (event.key === "Enter") {
        event.preventDefault();
        activate(row.item);
      } else if (event.key === "Escape" && grab !== null) {
        event.preventDefault();
        event.stopPropagation();
        cancelGrab(grab, row.item.label);
      } else if (arrow !== null && ordered && (grab !== null || event.altKey)) {
        // Without a grab the arrows belong to the index's own walk unless the
        // modifier L-31 names is held.
        event.preventDefault();
        handleArrow(row.item, row.index, arrow);
      }
    }

    function handleClick(event: MouseEvent): void {
      if (grab !== null) return;
      const row = rowItem(event);
      if (row !== null) activate(row.item);
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
    if (grab !== null || !ordered) return;
    // A control in the row is a control, not a handle.
    if (
      event.target instanceof Element &&
      event.target.closest("button") !== null
    )
      return;
    armLayoutDrag({
      event: event.nativeEvent,
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
      {ordered ? (
        <p id={instructionsId} className="sr-only">
          {GRAB_INSTRUCTIONS}
        </p>
      ) : null}
      <div ref={listRef} className="flex flex-col gap-1">
        {shown.map((item) => (
          // The card, not the control: an expanded row's detail holds real
          // controls, so the thing carrying `role="button"` has to be the grab
          // line inside it rather than the box around both (P-9's trap).
          <div
            key={item.id}
            data-sortable-id={item.id}
            data-grabbed={grab?.id === item.id ? "1" : undefined}
            className={cn(
              "overflow-hidden rounded-lg border border-border bg-card",
              item.id === selectedId && "border-foreground",
            )}
            // On the card rather than on the grab line inside it: a focus
            // leaving anything in this row - the grab line, a control, a
            // control in its expanded detail - is a grab nobody is holding.
            onBlur={() => {
              if (grab !== null && grab.id === item.id)
                cancelGrab(grab, item.label);
            }}
          >
            <SortableRowLine
              item={item}
              instructionsId={ordered ? instructionsId : null}
              page={page}
              onPointerDown={(event) => {
                handlePointerDown(event, item.id);
              }}
            />
            {item.detail !== null && item.open ? (
              <div data-sortable-detail className="border-t border-border">
                {item.detail}
              </div>
            ) : null}
          </div>
        ))}
      </div>
      {ordered ? (
        <p className="sr-only" role="status" aria-live="polite">
          {announcement}
        </p>
      ) : null}
    </>
  );
}

/**
 * The grab line: the part of a row a pointer picks up and a key operates.
 *
 * A component of its own rather than more JSX inside the list's `map`, because
 * an expanded row's detail holds real controls - so `role="button"` has to sit
 * on this line and not on the card around both (P-9's trap), and the line is
 * where every one of the row's optional parts is decided.
 */
function SortableRowLine<Id extends string>(props: {
  readonly item: SortableListItem<Id>;
  /** The static instructions to point at, or `null` in an unordered list. */
  readonly instructionsId: string | null;
  readonly page: boolean;
  readonly onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
}): ReactNode {
  const { item, instructionsId, page, onPointerDown } = props;
  const onRemove = item.onRemove;
  return (
    <div
      // Every row, not only the ones that open something: a row that can be
      // focused, grabbed and moved has an operation whether or not it also has
      // a destination.
      role="button"
      aria-describedby={instructionsId ?? undefined}
      aria-expanded={item.detail === null ? undefined : item.open}
      tabIndex={0}
      className={cn(
        "flex touch-none items-center gap-2",
        page ? "px-3 py-2.5 text-ui" : "px-2.5 py-1.5 text-ui-sm",
        item.dimmed && "text-muted-foreground",
      )}
      onPointerDown={onPointerDown}
    >
      {instructionsId === null ? null : (
        <GripVertical
          aria-hidden
          className="size-3.5 shrink-0 cursor-grab text-muted-foreground"
        />
      )}
      {item.icon ? (
        <item.icon className="size-3.5 shrink-0 text-muted-foreground" />
      ) : null}
      {/* A divider IS a line, so its row draws one where a panel's name would
        keep going: the list reads the way the rail does. */}
      {item.divider ? (
        <>
          <span className="shrink-0">{item.label}</span>
          <span aria-hidden className="h-px flex-1 bg-border" />
        </>
      ) : (
        <SortableRowName item={item} />
      )}
      {item.control === null ? null : (
        <div className="flex shrink-0 items-center gap-1.5">{item.control}</div>
      )}
      {onRemove === null ? null : (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={`Remove ${item.label.toLowerCase()}`}
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
        >
          <X />
        </Button>
      )}
      {item.detail === null ? null : (
        <ChevronRight
          aria-hidden
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-transform",
            item.open && "rotate-90",
          )}
        />
      )}
    </div>
  );
}

/** A member's name, its changed dot and the presence rule under it (L-47). */
function SortableRowName<Id extends string>(props: {
  readonly item: SortableListItem<Id>;
}): ReactNode {
  const { item } = props;
  return (
    <div className="min-w-0 flex-1">
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="min-w-0 truncate">{item.label}</span>
        {item.changed ? (
          <span
            aria-hidden
            data-testid="changed-dot"
            className="size-1.5 shrink-0 rounded-full bg-info"
          />
        ) : null}
      </div>
      {item.hint === null ? null : (
        <p className="mt-0.5 text-ui-xs text-muted-foreground">{item.hint}</p>
      )}
    </div>
  );
}

/** Everything the row's disclosure opened, which the row itself must not claim. */
const DETAIL_SELECTOR = "[data-sortable-detail]";

/**
 * What pressing a row does: open its own disclosure in place, or open the
 * screen it names. Never both - a row has one destination.
 */
function activate<Id extends string>(item: SortableListItem<Id>): void {
  if (item.onToggleOpen !== null) {
    item.onToggleOpen();
    return;
  }
  item.onActivate?.();
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
