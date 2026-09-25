// T06 production lifecycle gate — promotes T02's positive Dialog/Popover
// Activity-concealment cases (base-ui-proofs.tsx's LifecycleProof /
// LifecycleHostBoundary) onto the REAL production stack: the actual
// PortalConcealmentBoundary (portal-concealment-context.tsx), the actual
// SurfacePresentationBoundary (layout/surface-presentation-boundary.tsx) for
// pane focus/visibility, the actual Dialog/Popover wrappers with their native
// onOpenChange/onOpenChangeComplete/initialFocus/finalFocus callbacks, and
// the actual useOverlayFrame for the nested case. T02's own fixture stays
// untouched; this is a separate module, driven by
// scripts/portal-lifecycle-gate.mjs over CDP.
import { useState, useLayoutEffect, useRef, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import "@/index.css";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Popover as NativePopover } from "@base-ui/react/popover";
import { PortalConcealmentBoundary } from "@/components/ui/portal-concealment-context";
import { SurfacePresentationBoundary } from "@/components/layout/surface-presentation-boundary";
import {
  OverlayFrameContext,
  useOverlayFrame,
} from "@/components/ui/overlay-frame-context";

const params = new URLSearchParams(location.search);
const family = params.get("family") === "popover" ? "popover" : "dialog";
const controlled = params.get("controlled") !== "false";
const nested = params.get("nested") === "true";
// R2: an owner that closes by removing its `open`-literal Root entirely
// (ThemeManager's actual pattern - `open` never flips to `false`) instead of
// toggling `open`/`onOpenChange` on a Root that stays mounted.
const conditionalRoot = params.get("conditionalRoot") === "true";
// R5: a child that focuses itself in a mount effect, before Base ever
// invokes the wrapper's deferred `initialFocus` resolver - the real
// `GitDiffRepoSwitcherDropdown` / `WorktreeFolderList` pattern.
const autofocus = params.get("autofocus") === "true";
// Coordinator parity case: unwrapped Base 1.8 Popover, no wrapper focus
// core - the measured baseline the wrapper's outside-press behavior must
// match, not an assumed one.
const native = params.get("native") === "true";

interface Frame {
  readonly registry: Set<object>;
}

declare global {
  interface Window {
    gate: {
      conceal: (next: boolean) => void;
      rapidConcealReveal: () => void;
      focusPane: (next: boolean) => void;
      visiblePane: (next: boolean) => void;
      openOuter: () => void;
      closeOwner: () => void;
      rapidOpenClose: () => void;
      openNested: () => void;
      events: string[];
      focusEvents: string[];
    };
  }
}
window.gate = {
  conceal: () => undefined,
  rapidConcealReveal: () => undefined,
  focusPane: () => undefined,
  visiblePane: () => undefined,
  openOuter: () => undefined,
  closeOwner: () => undefined,
  rapidOpenClose: () => undefined,
  openNested: () => undefined,
  events: [],
  focusEvents: [],
};

/**
 * Registered under the outer overlay's `OverlayFrameContext` via the real
 * `useOverlayFrame()` - `useOverlayFrameRegistration` inside the app's own
 * Dialog/Popover wrapper picks this up automatically while open. Proves a
 * nested overlay's own logical state and content survive the SAME
 * concealment/return cycle as its owner, independently.
 */
function NestedOverlay(): ReactNode {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("nested staged");
  useLayoutEffect(() => {
    window.gate.openNested = () => flushSync(() => setOpen(true));
  }, []);
  const body = (
    <label>
      Nested draft
      <input
        aria-label="Nested draft"
        data-gate-nested-draft
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
    </label>
  );
  return family === "popover" ? (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger data-gate-nested-trigger>Nested</PopoverTrigger>
      <PopoverContent data-gate-subpopup aria-label="Nested popover">
        {body}
      </PopoverContent>
    </Popover>
  ) : (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger data-gate-nested-trigger>Nested</DialogTrigger>
      <DialogContent data-gate-subpopup aria-describedby={undefined}>
        <DialogTitle>Nested</DialogTitle>
        {body}
      </DialogContent>
    </Dialog>
  );
}

function Content({ frame }: { readonly frame: Frame | null }): ReactNode {
  const [draft, setDraft] = useState("staged");
  const draftRef = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    window.gate.events.push("content:connect");
    // Focus this child in a mount effect, same as it does in real callers -
    // before Base ever invokes the wrapper's deferred `initialFocus`
    // resolver, so `active` is already inside the popup by the time that
    // resolver runs.
    if (autofocus) draftRef.current?.focus();
    return () => {
      window.gate.events.push("content:disconnect");
    };
  }, []);
  return (
    <div data-gate-content>
      <label>
        Draft
        <input
          ref={draftRef}
          aria-label="Draft"
          data-gate-draft
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
      </label>
      <button type="button" data-gate-close>
        Close
      </button>
      {frame ? (
        <OverlayFrameContext.Provider value={frame.registry}>
          <NestedOverlay />
        </OverlayFrameContext.Provider>
      ) : null}
    </div>
  );
}

function Owner(): ReactNode {
  const [internalOpen, setInternalOpen] = useState(false);
  const [changes, setChanges] = useState(0);
  const [completes, setCompletes] = useState(0);
  const [finals, setFinals] = useState(0);
  const [initials, setInitials] = useState(0);
  const frameHook = useOverlayFrame();
  const frame: Frame | null = nested ? frameHook : null;
  // Only needed for `conditionalRoot`'s Popover: with no `PopoverTrigger`
  // inside the Root (the Root itself is what unmounts), the Positioner
  // needs an explicit anchor to position against.
  const conditionalTriggerRef = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    window.gate.openOuter = () => flushSync(() => setInternalOpen(true));
    window.gate.closeOwner = () => flushSync(() => setInternalOpen(false));
    // Mirrors rapidConcealReveal(): the first flip commits (flushSync, its
    // effects run), the second is issued right after in the same turn with
    // no flushSync of its own - the fastest reachable-from-outside interrupt
    // of the OPEN transition itself, before it can ever settle.
    window.gate.rapidOpenClose = () => {
      flushSync(() => setInternalOpen(true));
      setInternalOpen(false);
    };
  }, []);
  const onOpenChange = (next: boolean, details: { reason: string }): void => {
    window.gate.events.push(`change:${next}:${details.reason}`);
    setChanges((count) => count + 1);
    setInternalOpen(next);
  };
  const onOpenChangeComplete = (next: boolean): void => {
    window.gate.events.push(`complete:${next}`);
    setCompletes((count) => count + 1);
  };
  const initialFocus = (): boolean => {
    setInitials((count) => count + 1);
    return true;
  };
  const finalFocus = (): boolean => {
    setFinals((count) => count + 1);
    return true;
  };
  const rootProps = controlled
    ? { open: internalOpen, onOpenChange, onOpenChangeComplete }
    : { defaultOpen: false, onOpenChange, onOpenChangeComplete };
  const output = (
    <div
      data-gate-state
      data-changes={changes}
      data-completes={completes}
      data-finals={finals}
      data-initials={initials}
    />
  );
  if (conditionalRoot) {
    // `open` stays a literal `true` for the Root's whole mounted lifetime -
    // closing is the PARENT removing the Root from the tree, never an
    // onOpenChange round trip, so `cycle.open` is never committed `false`.
    const root =
      family === "popover" ? (
        <Popover open>
          <PopoverContent
            data-gate-popup
            aria-label="Lifecycle popover"
            anchor={conditionalTriggerRef}
            initialFocus={initialFocus}
            finalFocus={finalFocus}
          >
            <Content frame={frame} />
          </PopoverContent>
        </Popover>
      ) : (
        <Dialog open>
          <DialogContent
            data-gate-popup
            aria-describedby={undefined}
            initialFocus={initialFocus}
            finalFocus={finalFocus}
          >
            <DialogTitle>Lifecycle dialog</DialogTitle>
            <Content frame={frame} />
          </DialogContent>
        </Dialog>
      );
    return (
      <>
        {output}
        <button
          ref={conditionalTriggerRef}
          type="button"
          data-gate-trigger
          onClick={() => window.gate.openOuter()}
        >
          Open
        </button>
        {internalOpen ? root : null}
      </>
    );
  }
  if (family === "popover")
    return (
      <>
        {output}
        <Popover {...rootProps}>
          <PopoverTrigger data-gate-trigger>Open</PopoverTrigger>
          <PopoverContent
            data-gate-popup
            aria-label="Lifecycle popover"
            initialFocus={initialFocus}
            finalFocus={finalFocus}
          >
            <Content frame={frame} />
          </PopoverContent>
        </Popover>
      </>
    );
  return (
    <>
      {output}
      <Dialog {...rootProps}>
        <DialogTrigger data-gate-trigger>Open</DialogTrigger>
        <DialogContent
          data-gate-popup
          aria-describedby={undefined}
          initialFocus={initialFocus}
          finalFocus={finalFocus}
        >
          <DialogTitle>Lifecycle dialog</DialogTitle>
          <Content frame={frame} />
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Unwrapped `@base-ui/react/popover` - no `useOverlayFocus`/
 * `useOverlayPresentation`, no `initialFocus`/`finalFocus`. Exists only to
 * MEASURE Base's own default outside-press behavior for the parity case;
 * never asserted against directly by any other case.
 */
function NativePopoverParity(): ReactNode {
  return (
    <NativePopover.Root>
      <NativePopover.Trigger data-gate-trigger>Open</NativePopover.Trigger>
      <NativePopover.Portal>
        <NativePopover.Positioner>
          <NativePopover.Popup
            data-gate-popup
            aria-label="Native parity popover"
          >
            <input aria-label="Draft" data-gate-draft defaultValue="staged" />
          </NativePopover.Popup>
        </NativePopover.Positioner>
      </NativePopover.Portal>
    </NativePopover.Root>
  );
}

export function Fixture(): ReactNode {
  const [concealed, setConcealed] = useState(false);
  const [focused, setFocused] = useState(true);
  const [visible, setVisible] = useState(true);
  useLayoutEffect(() => {
    const focusEvents = window.gate.focusEvents;
    const recordFocus = (event: FocusEvent): void => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      // Base's FocusGuard sentinels (`utils/FocusGuard.mjs` - an invisible
      // `<span data-base-ui-focus-guard>` at a focus trap's boundary)
      // receive transient focus mid-teardown; they are never a real app
      // destination. Tag them distinctly rather than folding them into "A"
      // silently, so a genuine unexpected refocus (to the trigger, the
      // popup, anywhere else real) stays visible in the raw sequence
      // instead of being hidden behind this exclusion.
      if (target.hasAttribute("data-base-ui-focus-guard")) {
        focusEvents.push("G");
        return;
      }
      focusEvents.push(target.matches("[data-gate-outside]") ? "B" : "A");
    };
    document.addEventListener("focusin", recordFocus);
    // Mirrors primitive-gate.tsx's own pane-switch transaction: one flushed
    // commit, then an explicit move to Pane B's control - never waiting for
    // library cleanup to "repair" focus afterward.
    const transfer = (commit: () => void): void => {
      focusEvents.length = 0;
      flushSync(commit);
      document.querySelector<HTMLElement>("[data-gate-outside]")?.focus();
    };
    window.gate.conceal = (next) => flushSync(() => setConcealed(next));
    window.gate.rapidConcealReveal = () => {
      // The FIRST flip commits and its passive effects are allowed to run
      // (flushSync forces that); the SECOND is issued right after, in the
      // same synchronous turn, WITHOUT its own flushSync, so it can land
      // before React schedules/flushes anything from the first flip that
      // hasn't already run synchronously.
      flushSync(() => setConcealed(true));
      setConcealed(false);
    };
    window.gate.focusPane = (next) =>
      next ? setFocused(true) : transfer(() => setFocused(false));
    window.gate.visiblePane = (next) =>
      next ? setVisible(true) : transfer(() => setVisible(false));
    return () => document.removeEventListener("focusin", recordFocus);
  }, []);
  return (
    <main>
      <div data-gate-pane-state data-focused={focused} data-visible={visible} />
      <SurfacePresentationBoundary visible={visible} focused={focused}>
        <PortalConcealmentBoundary concealed={concealed}>
          {native ? <NativePopoverParity /> : <Owner />}
        </PortalConcealmentBoundary>
      </SurfacePresentationBoundary>
      {/* Fixed to an uncovered corner - an open popup positions near its
          trigger and can otherwise overlap this button, blocking a real
          click's hit-test (R4's outside-click case needs a genuine click,
          not just a `.focus()` call). */}
      <button
        type="button"
        data-gate-outside
        style={{ position: "fixed", right: 16, bottom: 16 }}
      >
        Outside
      </button>
      {/* Plain, non-focusable background - the parity case's outside press
          lands here, not on any focusable control. */}
      <div data-gate-background style={{ height: "200vh" }}>
        Scrollable document
      </div>
    </main>
  );
}

const container = document.getElementById("root");
if (!container) throw new Error("Missing root");
createRoot(container).render(<Fixture />);
