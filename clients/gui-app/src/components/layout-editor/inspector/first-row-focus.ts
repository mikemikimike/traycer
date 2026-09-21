/**
 * Putting focus on a list row from OUTSIDE the list.
 *
 * Two hosts have to do it and neither is the list: the Settings page's
 * ArrowDown out of the filter, which lands on the first row on the page
 * (L-125), and the same page's search landing, which lands on the row the
 * result named (5.9). Both had the same two facts to know, so they live here
 * once rather than as a selector written twice in files that know nothing else
 * about a row.
 *
 * The facts, both `sortable-list.tsx`'s (L-114): the row's identity is on the
 * CARD (`data-sortable-id`), and what a keyboard operates is the GRAB inside
 * it - the `role="button"` that holds the grip, the glyph and the name, and
 * deliberately none of the row's controls. So "focus the row" means the grab
 * and nothing else: focusing the card would focus nothing at all, since the
 * card is a plain box with no tab stop.
 */

/** The row's own tab stop, inside the card that carries its id. */
const ROW_GRAB_SELECTOR = '[role="button"]';

/** The card a row id resolves to, in the pane a caller scopes the search to. */
const ROW_CARD_SELECTOR = "[data-sortable-id]";

/**
 * Focus one row, given the card `layoutRegionRowSelector` found.
 *
 * Silent when the row is not there or has no grab: every caller is reacting to
 * something the user did elsewhere - a key in a field, a search result - and
 * neither has anything to say about a row that has since been filtered away.
 */
export function focusSortableRowGrab(row: Element | null): void {
  if (row === null) return;
  const grab = row.querySelector<HTMLElement>(ROW_GRAB_SELECTOR);
  grab?.focus();
}

/**
 * Focus the first row in a pane, in document order.
 *
 * Which is the first VISIBLE row by construction: a filtered-out row is not
 * rendered, and a card with nothing left disappears whole (L-103).
 */
export function focusFirstSortableRow(pane: Element | null): void {
  if (pane === null) return;
  focusSortableRowGrab(pane.querySelector(ROW_CARD_SELECTOR));
}
