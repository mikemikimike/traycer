/**
 * The name chip that appears beside a hovered region (L-12, 4.3).
 *
 * CSS anchor positioning, not measurement: the chip is a `position: fixed`
 * element on `document.body` pointing at whichever node currently carries
 * `data-layout-anchor~="hover"`, and the browser keeps it there through
 * transcript scrolling, a clipped status strip and a second chat tile without
 * this module reading a single rect. The measured path below exists for jsdom
 * and for a test Chrome without anchor positioning; which one ran is on the
 * element as `data-anchored`, so a browser regression can assert it.
 */

/** Section 6: the chip sits 6px off the region it names. */
const CHIP_MARGIN = 6;

/** Kept inside the app column rather than flush against the window edge. */
const EDGE_PADDING = 6;

/** Top-bar regions have nothing above them, so their chip goes underneath. */
export type HoverChipPlacement = "above" | "below";

export interface HoverChipController {
  readonly show: (input: {
    label: string;
    node: HTMLElement;
    placement: HoverChipPlacement;
  }) => void;
  readonly hide: () => void;
  readonly destroy: () => void;
}

export function createHoverChip(): HoverChipController {
  const element = document.createElement("div");
  element.setAttribute("data-layout-hover-chip", "");
  element.setAttribute("aria-hidden", "true");
  element.hidden = true;
  const anchored = supportsAnchorPositioning();
  element.setAttribute("data-anchored", anchored ? "1" : "0");
  document.body.append(element);

  return {
    show: ({ label, node, placement }) => {
      element.textContent = label;
      element.setAttribute("data-placement", placement);
      element.hidden = false;
      if (anchored) return;
      place(element, node, placement);
    },
    hide: () => {
      element.hidden = true;
    },
    destroy: () => {
      element.remove();
    },
  };
}

/**
 * jsdom has no `CSS` object at all, which is the same answer as a browser
 * without anchor positioning: measure instead.
 */
function supportsAnchorPositioning(): boolean {
  return (
    typeof CSS !== "undefined" &&
    CSS.supports("anchor-name: --a") &&
    CSS.supports("position-area: block-start center")
  );
}

/**
 * The measured fallback: just outside the region, centred on it, flipped and
 * clamped so it stays inside the app column rather than drifting over the
 * inspector or off the window.
 */
function place(
  element: HTMLElement,
  node: HTMLElement,
  placement: HoverChipPlacement,
): void {
  const region = node.getBoundingClientRect();
  const bounds = columnBounds(node);
  const width = element.offsetWidth;
  const height = element.offsetHeight;

  const above = region.top - CHIP_MARGIN - height;
  const below = region.bottom + CHIP_MARGIN;
  let top = placement === "below" ? below : above;
  if (top < bounds.top + EDGE_PADDING) top = below;
  if (top + height > bounds.bottom - EDGE_PADDING)
    top = Math.max(bounds.top + EDGE_PADDING, above);

  const centred = region.left + region.width / 2 - width / 2;
  const left = Math.min(
    Math.max(centred, bounds.left + EDGE_PADDING),
    Math.max(bounds.left + EDGE_PADDING, bounds.right - width - EDGE_PADDING),
  );

  element.style.top = `${top}px`;
  element.style.left = `${left}px`;
}

function columnBounds(node: HTMLElement): DOMRect {
  const column = node.closest("[data-layout-editing]");
  return column === null
    ? new DOMRect(0, 0, window.innerWidth, window.innerHeight)
    : column.getBoundingClientRect();
}
