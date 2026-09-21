import {
  MAX_SPRING_STEP_SECONDS,
  prefersReducedMotion,
  RING_SPRING,
  Spring,
} from "@/components/layout-editor/canvas/spring";

/**
 * The one selection ring, which travels between regions (L-29, 4.6).
 *
 * One element and one rAF loop for the whole editor, rather than a ring per
 * region: the point of the travel is that the SAME object moves, and two rings
 * cross-fading is a different, cheaper-looking thing.
 *
 * It is the one piece of the editor that still measures rects, because a CSS
 * outline cannot animate from one element's box to another's. Everything else
 * about selection is a data attribute (L-13).
 */

/** Clears the region's own edge without swallowing its neighbours. */
const RING_PADDING = 3;

export interface SelectionRingController {
  /**
   * The node the ring should be on now, or `null` to put it away.
   *
   * Identity-guarded: called with the node it is already on, it does nothing.
   * The canvas painter runs on every editor-store notification, and re-arming
   * the rAF loop from there forced a layout read per notification for a ring
   * that had already arrived (G1-04).
   */
  readonly track: (node: HTMLElement | null) => void;
  /**
   * Re-measure the node it is already on, because the canvas UNDER it moved.
   *
   * Its own entry point rather than a side effect of {@link track}, so the
   * things that actually move a region - a layout write, a preset preview, a
   * scroll, a resize, the node's own size - are the things that wake the loop,
   * and a hover or a filter keystroke is not.
   */
  readonly refresh: () => void;
  readonly destroy: () => void;
}

export function createSelectionRing(): SelectionRingController {
  const element = document.createElement("div");
  element.setAttribute("data-layout-selection-ring", "");
  element.setAttribute("aria-hidden", "true");
  element.hidden = true;
  document.body.append(element);

  const springs = {
    x: new Spring(0, RING_SPRING.response, RING_SPRING.zeta),
    y: new Spring(0, RING_SPRING.response, RING_SPRING.zeta),
    width: new Spring(0, RING_SPRING.response, RING_SPRING.zeta),
    height: new Spring(0, RING_SPRING.response, RING_SPRING.zeta),
  };
  const observer = new ResizeObserver(() => {
    arm();
  });

  let tracked: HTMLElement | null = null;
  let frame = 0;
  let lastFrameAt = 0;
  // The first frame on a fresh selection places the ring without travelling
  // to it from wherever it last was, and fades it in instead.
  let fresh = true;

  function arm(): void {
    if (tracked === null || frame !== 0) return;
    lastFrameAt = performance.now();
    frame = requestAnimationFrame(tick);
  }

  function tick(now: number): void {
    frame = 0;
    const node = tracked;
    if (node === null) return;
    const step = Math.min((now - lastFrameAt) / 1000, MAX_SPRING_STEP_SECONDS);
    lastFrameAt = now;

    const rect = node.getBoundingClientRect();
    const target = {
      x: rect.left - RING_PADDING,
      y: rect.top - RING_PADDING,
      width: rect.width + RING_PADDING * 2,
      height: rect.height + RING_PADDING * 2,
    };

    if (fresh || prefersReducedMotion()) {
      springs.x.snap(target.x);
      springs.y.snap(target.y);
      springs.width.snap(target.width);
      springs.height.snap(target.height);
    } else {
      springs.x.setTarget(target.x);
      springs.y.setTarget(target.y);
      springs.width.setTarget(target.width);
      springs.height.setTarget(target.height);
      springs.x.step(step);
      springs.y.step(step);
      springs.width.step(step);
      springs.height.step(step);
    }

    element.style.transform = `translate(${springs.x.value.toFixed(2)}px, ${springs.y.value.toFixed(2)}px)`;
    element.style.width = `${Math.max(0, springs.width.value).toFixed(2)}px`;
    element.style.height = `${Math.max(0, springs.height.value).toFixed(2)}px`;
    element.hidden = false;

    if (fresh) {
      // One frame with the ring placed but still transparent, so the opacity
      // transition has something to run from.
      fresh = false;
      lastFrameAt = now;
      frame = requestAnimationFrame(tick);
      return;
    }
    element.setAttribute("data-on", "1");

    // Parked once it has arrived: a rAF loop that keeps reading a rect at rest
    // is the expensive half of this design, and nothing is moving.
    if (!settled()) {
      lastFrameAt = now;
      frame = requestAnimationFrame(tick);
    }
  }

  function settled(): boolean {
    return (
      springs.x.settled() &&
      springs.y.settled() &&
      springs.width.settled() &&
      springs.height.settled()
    );
  }

  function track(node: HTMLElement | null): void {
    if (node === tracked) return;
    if (tracked !== null) observer.unobserve(tracked);
    tracked = node;
    if (node === null) {
      cancel();
      element.removeAttribute("data-on");
      element.hidden = true;
      fresh = true;
      return;
    }
    observer.observe(node);
    arm();
  }

  function cancel(): void {
    if (frame !== 0) cancelAnimationFrame(frame);
    frame = 0;
  }

  // A scroll or a window resize moves the region without resizing it, so
  // neither observer above would see it.
  const wake = (): void => {
    arm();
  };
  window.addEventListener("scroll", wake, { capture: true, passive: true });
  window.addEventListener("resize", wake, { passive: true });

  return {
    track,
    refresh: arm,
    destroy: () => {
      cancel();
      observer.disconnect();
      window.removeEventListener("scroll", wake, { capture: true });
      window.removeEventListener("resize", wake);
      element.remove();
      tracked = null;
    },
  };
}
