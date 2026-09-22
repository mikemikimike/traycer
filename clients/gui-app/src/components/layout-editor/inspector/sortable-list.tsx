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
import {
  sortableRowPadding,
  type SortableRowPadding,
} from "@/components/layout-editor/inspector/sortable-row-padding";
import { Button } from "@/components/ui/button";
import { movedWithin } from "@/lib/layout/layout-arrangement";
import { cn } from "@/lib/utils";
import { useSettingsDensity } from "@/providers/settings-density-context";

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
  /**
   * The real component at 1:1 in place of the registry's icon (L-120): the
   * rail's own button on a Sidebar row, where the list IS the picture the page
   * used to draw on a plinth above it. `null` on every other list, whose
   * depictions are either too wide to be a glyph or already in the surface's
   * band.
   */
  readonly glyph: ReactNode;
  /** A divider (L-155) rather than a region: a rule, with no state. */
  readonly divider: boolean;
  /** Drawn muted: the member is hidden. */
  readonly dimmed: boolean;
  /** Differs from what shipped - the row's own changed dot (L-20, P-7). */
  readonly changed: boolean;
  /**
   * The presence rule (L-47), where one exists. Drawn as the first line of the
   * row's DISCLOSURE rather than under its name (R3-08): a hint that is
   * sometimes there and sometimes not gave one list three row heights, and a
   * rule about when a panel appears is exactly the kind of thing a row opens to
   * explain. It stays the grab's description either way, so a screen reader
   * still hears it without opening anything.
   */
  readonly hint: string | null;
  /**
   * The row's ONE state control (L-121). `null` in the dock, where the section
   * header above the list owns it and a second copy on the row would be D5
   * again.
   */
  readonly control: ReactNode;
  /**
   * Putting this row back, drawn in a slot the row reserves whether or not
   * there is anything to put in it (L-122). Kept apart from
   * {@link SortableListItem.control} for exactly that reason: a revert that
   * shares the control's box moves the whole right-hand column the moment a
   * value changes (LV2-11).
   */
  readonly revert: ReactNode;
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
  /**
   * What this list is, for the `role="group"` around it: a page with six lists
   * on it has to tell a screen reader which one a row belongs to, and the
   * card's heading is not in the row's own context.
   */
  readonly label: string;
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
  const { items, label, selectedId, onMove } = props;
  const host = useLayoutFormHost();
  const page = host === "page";
  const compact = useSettingsDensity() === "compact";
  const listRef = useRef<HTMLDivElement | null>(null);
  const instructionsId = useId();
  const [grab, setGrab] = useState<KeyboardGrab<Id> | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const ordered = onMove !== null;
  // Reserved by the LIST rather than by the row, and on a capability rather
  // than on a value: a slot that appeared the moment a row became changed
  // would shift that row's controls by its own width, which is the jump
  // LV2-11 measured. Every page row can be reverted, and a list with a
  // removable member (the rail's dividers) reserves it in the dock too.
  const reserveSlot = page || items.some((item) => item.onRemove !== null);
  const gutter = sortableRowPadding(page, compact);

  // While an item is grabbed the list draws where it WOULD land. Nothing is
  // written until the drop, so Escape is a true cancel and the whole move is
  // one history entry however many arrow presses it took.
  const shown = grab === null ? items : movedWithin(items, grab.from, grab.to);

  function cancelGrab(current: KeyboardGrab<Id>, itemLabel: string): void {
    setGrab(null);
    setAnnouncement(
      positionMessage(
        "Cancelled, returned",
        itemLabel,
        current.from,
        items.length,
      ),
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
      {/* One surface with rows in it, not a stack of cards in a card: the row
          is the card's own row, ruled off from the next exactly as
          `SettingsRow` is, and it lifts only while it is being held. */}
      <div
        ref={listRef}
        role="group"
        aria-label={label}
        className="flex flex-col"
      >
        {shown.map((item) => (
          <SortableRow
            key={item.id}
            item={item}
            instructionsId={ordered ? instructionsId : null}
            page={page}
            gutter={gutter}
            reserveSlot={reserveSlot}
            selected={item.id === selectedId}
            grabbed={grab?.id === item.id}
            onPointerDown={(event) => {
              handlePointerDown(event, item.id);
            }}
            onBlur={() => {
              if (grab !== null && grab.id === item.id)
                cancelGrab(grab, item.label);
            }}
          />
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
 * One row: its line, its disclosure, and the presence rule that belongs to
 * both.
 *
 * Its own component because the hint needs an `id` the GRAB points at and the
 * DISCLOSURE draws, and those are on either side of the line - so the id has to
 * be minted a level above both, which is a hook and therefore not something the
 * list's `map` can do.
 *
 * The row carries the row's identity and nothing operable: the thing with
 * `role="button"` is the NAME inside the line, because a composite widget must
 * not contain the controls it would otherwise name itself from (P-9's trap,
 * R1-02). The focus indicator is on this box rather than on the grab, so what
 * reads as focused is the whole row the keyboard operates (R2-03) - written in
 * `layout-editor.css` beside the grabbed row's lift, which is the file that
 * owns this row's other states (R3-18).
 */
function SortableRow<Id extends string>(props: {
  readonly item: SortableListItem<Id>;
  readonly instructionsId: string | null;
  readonly page: boolean;
  readonly gutter: SortableRowPadding;
  readonly reserveSlot: boolean;
  readonly selected: boolean;
  readonly grabbed: boolean;
  readonly onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  readonly onBlur: () => void;
}): ReactNode {
  const {
    item,
    instructionsId,
    page,
    gutter,
    reserveSlot,
    selected,
    grabbed,
    onPointerDown,
    onBlur,
  } = props;
  const hintId = useId();
  const open = item.detail !== null && item.open;
  // Built once and placed in one of two ways, because it is ONE description
  // whichever of them the row is showing: the first line of the open
  // disclosure, or a line only a screen reader reaches while it is closed.
  const hint =
    item.hint === null ? null : (
      <SortableRowHint
        id={hintId}
        hint={item.hint}
        open={open}
        page={page}
        padding={gutter.row}
      />
    );
  return (
    <div
      data-sortable-id={item.id}
      data-sortable-selected={selected ? "1" : undefined}
      data-grabbed={grabbed ? "1" : undefined}
      className={cn(
        "relative border-b border-border/40 transition-[background-color,box-shadow] duration-100 ease-out last:border-b-0",
        selected && "bg-foreground/6",
      )}
      // On the row rather than on the grab line inside it: a focus leaving
      // anything in this row - the grab line, a control, a control in its
      // expanded detail - is a grab nobody is holding.
      onBlur={onBlur}
    >
      <SortableRowLine
        item={item}
        instructionsId={instructionsId}
        hintId={item.hint === null ? null : hintId}
        padding={item.divider ? gutter.divider : gutter.row}
        reserveSlot={reserveSlot}
        onPointerDown={onPointerDown}
      />
      {open ? (
        <div data-sortable-detail className="border-t border-border/40">
          {hint}
          {item.detail}
        </div>
      ) : (
        hint
      )}
    </div>
  );
}

/**
 * The presence rule (L-47, R3-08).
 *
 * Open, it is the first thing the disclosure says - the row explaining itself
 * on the line the user asked for. Closed, it is still in the document and still
 * the grab's `aria-describedby` target, so the rule reaches a screen reader
 * without the row being opened, and takes no height while it does: a hint that
 * occupied a line only on the rows that have one is what gave one list three
 * row heights (LV2-11).
 */
function SortableRowHint(props: {
  readonly id: string;
  readonly hint: string;
  readonly open: boolean;
  readonly page: boolean;
  /** The row's own gutter, so the line starts in the rows' column. */
  readonly padding: string;
}): ReactNode {
  const { id, hint, open, page, padding } = props;
  if (!open) {
    return (
      <p id={id} className="sr-only">
        {hint}
      </p>
    );
  }
  return (
    <p
      id={id}
      className={cn(
        "max-w-[72ch] text-pretty text-muted-foreground",
        padding,
        // After the gutter, which carries the row's own type scale: a
        // description reads a notch under the name it belongs to.
        page ? "text-ui-sm" : "text-ui-xs",
      )}
    >
      {hint}
    </p>
  );
}

/**
 * The row's one line: what a pointer picks up, what a key operates, and
 * whatever the host hung on the end of it.
 *
 * The line is a plain box and the OPERATION sits on the grab inside it
 * (`role="button"` on the name, the host's controls as its siblings). A
 * `role="button"` computes its accessible name from its contents and must not
 * contain interactive descendants, so a page row that carried its own Shown
 * radios, its Size and its revert read to a screen reader as one collapsed
 * button named "Agents Auto Shown Hidden", with three real controls unreachable
 * as controls (R1-02). Putting the role on the whole line was that defect; the
 * split is what fixes it, and the line keeps the padding so the drag's hit area
 * is still the row rather than the words in it.
 *
 * The chevron stays OUTSIDE the grab, at the end of the line where a disclosure
 * belongs: it is `aria-hidden` decoration, `aria-expanded` is on the grab, and
 * the alternative was drawing it between the name and the controls.
 *
 * The presence rule is outside the grab too, and for the same reason one rung
 * down: a `role="button"` names itself from everything it contains, so the
 * Pull requests row was announced as a button called "Pull requests Auto -
 * appears when this repo has pull requests" (R2-08). It is pointed at by
 * `aria-describedby` beside the grab instructions, which is what a description
 * IS, and it is drawn by the ROW rather than by the line, because it belongs to
 * the disclosure now (R3-08).
 */
function SortableRowLine<Id extends string>(props: {
  readonly item: SortableListItem<Id>;
  /** The static instructions to point at, or `null` in an unordered list. */
  readonly instructionsId: string | null;
  /** The row's presence rule, wherever the row has drawn it, or `null`. */
  readonly hintId: string | null;
  /** The row's own gutter and type scale, decided once by the list. */
  readonly padding: string;
  readonly reserveSlot: boolean;
  readonly onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
}): ReactNode {
  const { item, instructionsId, hintId, padding, reserveSlot, onPointerDown } =
    props;
  const onRemove = item.onRemove;
  const described = [instructionsId, hintId]
    .filter((id): id is string => id !== null)
    .join(" ");
  return (
    <div
      data-row-line
      className={cn("flex touch-none flex-col", padding)}
      onPointerDown={onPointerDown}
    >
      <div
        className={cn(
          // Below `md` the controls drop to their own line under the name and
          // stay right-aligned there, which is the only way a row carrying a
          // three-option control lays out on the one layout surface a phone
          // has (L-64).
          "flex items-center gap-2 max-md:flex-wrap max-md:gap-y-3",
          item.dimmed && "text-muted-foreground",
        )}
      >
        <div
          // Every row, not only the ones that open something: a row that can be
          // focused, grabbed and moved has an operation whether or not it also
          // has a destination.
          role="button"
          aria-describedby={described === "" ? undefined : described}
          aria-expanded={item.detail === null ? undefined : item.open}
          tabIndex={0}
          className="flex min-w-0 flex-1 items-center gap-2 focus-visible:outline-none max-md:basis-full"
        >
          {instructionsId === null ? null : (
            <GripVertical
              aria-hidden
              data-row-grip
              className="size-3.5 shrink-0 cursor-grab text-muted-foreground"
            />
          )}
          <SortableRowGlyph item={item} />
          {/* A divider IS a line, so its row draws one where a panel's name
            would keep going: the list reads the way the rail does. */}
          {item.divider ? (
            <>
              <span className="shrink-0 text-muted-foreground">
                {item.label}
              </span>
              <span
                aria-hidden
                data-divider-rule
                className="h-px flex-1 bg-border"
              />
            </>
          ) : (
            <SortableRowName item={item} />
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5 max-md:ml-auto">
          {item.control}
          {/* Fixed, and empty when there is nothing to put in it: the
            right-hand column of a list must not move because one row's value
            changed (L-122, LV2-11). A divider's Remove is the same slot - it
            is that row's one verb. */}
          {reserveSlot ? (
            <div
              data-revert-slot
              className="flex size-6 shrink-0 items-center justify-center"
            >
              {onRemove === null ? (
                item.revert
              ) : (
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
            </div>
          ) : null}
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
      </div>
    </div>
  );
}

/**
 * What stands where the row's icon goes: the real component at 1:1 where the
 * item carries one (L-120), the registry's icon otherwise, and nothing at all
 * for a row with neither.
 *
 * Its own component because the three cases are one question about one item,
 * and asking it inline made the row line a nested ternary inside a row that
 * already branches on the divider, the hint, the revert slot and the chevron.
 */
function SortableRowGlyph<Id extends string>(props: {
  readonly item: SortableListItem<Id>;
}): ReactNode {
  const { item } = props;
  if (item.glyph !== null) {
    // The real component, at 1:1 and taking no part in the page: `inert`
    // removes hit testing, focus and the a11y tree in one, so a picture of a
    // button is never a second button (L-77, L-120). Dimmed to the canvas's
    // own passive value when the region is hidden (L-79).
    return (
      <span
        inert
        data-row-glyph
        className={cn("shrink-0", item.dimmed && "opacity-45")}
      >
        {item.glyph}
      </span>
    );
  }
  if (item.icon === null) return null;
  // Every glyph carries a hook of its own, so a test can name THIS row's icon
  // rather than counting the SVGs in the line and breaking on the next
  // legitimate one (R1-19).
  return (
    <item.icon
      data-row-icon
      className="size-3.5 shrink-0 text-muted-foreground"
    />
  );
}

/** A member's name and its changed dot; the presence rule is a sibling (R2-08). */
function SortableRowName<Id extends string>(props: {
  readonly item: SortableListItem<Id>;
}): ReactNode {
  const { item } = props;
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5">
      <span className="min-w-0 truncate">{item.label}</span>
      {item.changed ? (
        <span
          aria-hidden
          data-testid="changed-dot"
          className="size-1.5 shrink-0 rounded-full bg-info"
        />
      ) : null}
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
