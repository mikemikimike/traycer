// Shared transport and presentation probes for the browser gates.
// Chrome process management remains in the existing launcher.
export {
  findChrome,
  launchChromeWithDevTools,
  terminateProcessTree,
} from "./chrome-launcher.mjs";

export function connect(url, exceptions, requestTimeout) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url),
      pending = new Map();
    let next = 0;
    let failure;
    const timer = setTimeout(
      () => reject(new Error("CDP connection timed out")),
      15000,
    );
    const fail = (error) => {
      failure = error;
      clearTimeout(timer);
      reject(error);
      for (const item of pending.values()) {
        clearTimeout(item.timer);
        item.reject(error);
      }
      pending.clear();
    };
    socket.addEventListener("error", () => fail(new Error("CDP socket error")));
    socket.addEventListener("close", () =>
      fail(new Error("CDP socket closed")),
    );
    socket.addEventListener("message", (event) => {
      const m = JSON.parse(String(event.data));
      if (m.method === "Runtime.exceptionThrown")
        exceptions.push(
          m.params.exceptionDetails.exception?.description ??
            m.params.exceptionDetails.text,
        );
      const item = pending.get(m.id);
      if (!item) return;
      pending.delete(m.id);
      clearTimeout(item.timer);
      if (m.error) item.reject(new Error(m.error.message));
      else item.resolve(m.result);
    });
    socket.addEventListener("open", () => {
      clearTimeout(timer);
      resolve({
        send(method, params) {
          if (failure) return Promise.reject(failure);
          return new Promise((resolve, reject) => {
            const id = ++next;
            const timer = setTimeout(() => {
              pending.delete(id);
              reject(new Error(`CDP timeout: ${method}`));
            }, requestTimeout);
            pending.set(id, { resolve, reject, timer });
            socket.send(JSON.stringify({ id, method, params }));
          });
        },
        close() {
          socket.close();
        },
      });
    });
  });
}

export function installPresentationProbes() {
  window.gatePainted = (el) => {
    if (!(el instanceof Element) || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    if (
      !r.width ||
      !r.height ||
      r.bottom <= 0 ||
      r.right <= 0 ||
      r.top >= innerHeight ||
      r.left >= innerWidth
    )
      return false;
    for (let node = el; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (
        node.hidden ||
        style.display === "none" ||
        style.visibility !== "visible" ||
        Number(style.opacity) === 0
      )
        return false;
    }
    return true;
  };
  window.gatePresented = (selector) =>
    [...document.querySelectorAll(selector)].some((el) => {
      if (
        !window.gatePainted(el) ||
        el.closest('[inert], [aria-hidden="true"]')
      )
        return false;
      // Passive tooltip/preview surfaces need not receive pointer events.
      if (getComputedStyle(el).pointerEvents === "none")
        return el.matches(
          "[data-slot=tooltip-content], [data-slot=hover-card-content]",
        );
      const r = el.getBoundingClientRect();
      return [
        [0.5, 0.5],
        [0.1, 0.1],
        [0.9, 0.9],
      ].some(([x, y]) => {
        const hit = document.elementFromPoint(
          Math.max(0, Math.min(innerWidth - 1, r.x + r.width * x)),
          Math.max(0, Math.min(innerHeight - 1, r.y + r.height * y)),
        );
        return hit && el.contains(hit);
      });
    });
  // Shared by the primitive and lifecycle lanes:
  // `gateClosedPure` is side-effect-free (safe to poll in a `wait` loop);
  // `gateUnreachable` moves focus as part of its own probe, so call it once,
  // never in a loop. A retained-but-hidden Popup (Select keeps its DOM node
  // for typeahead) is closed here via its `[hidden]` ancestor, not removal.
  window.gateClosedPure = (popupSelector) => {
    const popup = document.querySelector(popupSelector);
    if (!popup) return true;
    return !!popup.closest("[hidden]");
  };
  window.gateUnreachable = (popupSelector, triggerSelector) => {
    const popup = document.querySelector(popupSelector);
    if (!popup)
      return { closed: true, present: false, reason: "removed from DOM" };
    const present = window.gatePresented(popupSelector);
    const notPainted = !window.gatePainted(popup);
    const isInert = !!popup.closest("[inert]");
    const hasHiddenAncestor = !!popup.closest("[hidden]");
    const excludedFromA11y =
      hasHiddenAncestor ||
      popup.getAttribute("aria-hidden") === "true" ||
      !!popup.closest('[aria-hidden="true"]');
    const before = document.activeElement;
    const focusableDescendant = popup.querySelector(
      '[tabindex], button, [href], input, select, textarea, [role="option"], [role="menuitem"], [role="menuitemcheckbox"]',
    );
    popup.focus?.({ preventScroll: true });
    focusableDescendant?.focus?.({ preventScroll: true });
    const tookFocus =
      document.activeElement !== before &&
      (document.activeElement === popup ||
        popup.contains(document.activeElement));
    if (tookFocus) before?.focus?.({ preventScroll: true });
    const dupId = (id) =>
      id ? document.querySelectorAll(`#${CSS.escape(id)}`).length > 1 : false;
    const dupPopupId = dupId(popup.id);
    const trigger = triggerSelector
      ? document.querySelector(triggerSelector)
      : null;
    const dupControlsId = dupId(trigger?.getAttribute("aria-controls"));
    const dupLabelledById = (trigger?.getAttribute("aria-labelledby") ?? "")
      .split(/\s+/)
      .filter(Boolean)
      .some(dupId);
    return {
      closed:
        !present &&
        notPainted &&
        hasHiddenAncestor &&
        excludedFromA11y &&
        !tookFocus &&
        !dupPopupId &&
        !dupControlsId &&
        !dupLabelledById,
      present,
      notPainted,
      isInert,
      hasHiddenAncestor,
      excludedFromA11y,
      tookFocus,
      dupPopupId,
      dupControlsId,
      dupLabelledById,
    };
  };
  window.gateSurfacesHidden = () => {
    if (
      [
        ...document.querySelectorAll(
          "[data-gate-popup], [data-gate-subpopup], [data-slot=dialog-overlay], [data-slot=sheet-overlay]",
        ),
      ].some(window.gatePainted)
    )
      return false;
    return ![
      ...document.querySelectorAll(
        '[data-gate-positioner], [data-slot$="-positioner"]',
      ),
    ].some((el) => {
      if (!window.gatePainted(el)) return false;
      const s = getComputedStyle(el),
        r = el.getBoundingClientRect();
      // A transparent, pointer-inert positioner around hidden retained content
      // has geometry but paints nothing. A backdrop or an intercepting box does.
      const colorVisible = (color) =>
        color !== "transparent" &&
        !(color.startsWith("rgba(") && color.endsWith(", 0)"));
      const paints =
        colorVisible(s.backgroundColor) ||
        s.backgroundImage !== "none" ||
        s.boxShadow !== "none" ||
        ["Top", "Right", "Bottom", "Left"].some(
          (side) =>
            parseFloat(s["border" + side + "Width"]) > 0 &&
            colorVisible(s["border" + side + "Color"]),
        );
      const hit = document.elementFromPoint(
        r.x + r.width / 2,
        r.y + r.height / 2,
      );
      return paints || (hit && el.contains(hit));
    });
  };
  window.gateLockStyles = () =>
    [document.documentElement, document.body].map((el) => {
      const s = getComputedStyle(el);
      return [
        s.overflowX,
        s.overflowY,
        s.position,
        s.touchAction,
        s.pointerEvents,
      ];
    });
}
