/**
 * The edit firewall (4.4): the app column stays alive and stays quiet.
 *
 * `inert` is not usable here. It removes the subtree from hit testing, so a
 * region inside an inert `<main>` would never fire the hover and the click the
 * canvas resolves from - and pointing at the real thing is the whole model
 * (P3, L-01). What the column gets instead is a capture-phase listener per
 * gesture that could change something, plus a focus bounce so neither the
 * app's controls nor the canvas regions are tab stops (L-31).
 *
 * Wheel and touch scroll are deliberately absent: the app under the editor
 * keeps streaming and the transcript keeps scrolling (L-17).
 */

/**
 * Every gesture swallowed at the column. `dragenter`, `dragover`, `dragleave`,
 * `drop` and `paste` are on the list because the composer carries real
 * handlers for all five (C-16), so a file dragged from Finder onto the dimmed
 * composer would otherwise attach itself mid-session.
 */
export const FIREWALLED_EVENT_TYPES = [
  "click",
  "dblclick",
  "auxclick",
  "pointerdown",
  "keydown",
  "keypress",
  "contextmenu",
  "submit",
  "dragstart",
  "dragenter",
  "dragover",
  "dragleave",
  "drop",
  "paste",
] as const;

export interface EditFirewallInput {
  /** The element 4.5 names the app column; never an ancestor of the inspector. */
  readonly column: HTMLElement;
  /**
   * Where focus goes when something inside the column takes it. Read on every
   * bounce rather than captured, because the inspector's own tree changes as
   * the user walks it.
   */
  readonly focusTarget: () => HTMLElement | null;
}

export function installEditFirewall(input: EditFirewallInput): () => void {
  const { column, focusTarget } = input;

  const swallow = (event: Event): void => {
    event.preventDefault();
    // Not `stopPropagation`: a handler bound on the column itself is exactly
    // as able to act on the app as one further down.
    event.stopImmediatePropagation();
  };

  const bounce = (): void => {
    focusTarget()?.focus({ preventScroll: true });
  };

  for (const type of FIREWALLED_EVENT_TYPES) {
    column.addEventListener(type, swallow, true);
  }
  column.addEventListener("focusin", bounce, true);
  // The column is announced through the relay row while the editor is open;
  // it is not an ancestor of the inspector, so the inspector stays readable
  // (4.5, 4.8).
  column.setAttribute("aria-hidden", "true");
  // Focus may already be inside the column when the session opens - the button
  // that opened it, most of the time.
  if (column.contains(document.activeElement)) bounce();

  return () => {
    for (const type of FIREWALLED_EVENT_TYPES) {
      column.removeEventListener(type, swallow, true);
    }
    column.removeEventListener("focusin", bounce, true);
    column.removeAttribute("aria-hidden");
  };
}
