import { useCallback, useEffect, useState, type ReactNode } from "react";
import "@/components/layout-editor/layout-editor.css";
import { installEditFirewall } from "@/components/layout-editor/canvas/edit-firewall";
import { useLayoutCanvas } from "@/components/layout-editor/canvas/layout-canvas";
import { useFloatingDock } from "@/components/layout-editor/inspector/dock-modes";
import { InspectorBackRow } from "@/components/layout-editor/inspector/inspector-back-row";
import { InspectorIndex } from "@/components/layout-editor/inspector/inspector-index";
import { InspectorShell } from "@/components/layout-editor/inspector/inspector-shell";
import { LayoutFormHostContext } from "@/components/layout-editor/inspector/layout-form-host";
import { ProviderLevel } from "@/components/layout-editor/inspector/provider-level";
import { RegionSection } from "@/components/layout-editor/inspector/region-section";
import { regionFacts } from "@/components/layout-editor/regions/region-facts";
import {
  initializeLayoutEditorWindow,
  watchLayoutEditorLease,
} from "@/lib/layout/editor-lease";
import { setLayoutInspectorNode } from "@/lib/layout/editor-motion";
import {
  abandonLayoutEditorSession,
  closeLayoutEditor,
  type LayoutEditorExitReason,
} from "@/lib/layout/editor-session";
import { USAGE_PROVIDER_IDS } from "@/lib/layout/layout-arrangement";
import type { RateLimitProviderId } from "@/lib/rate-limit-providers";
import { useDesktopWindowId } from "@/lib/windows/desktop-window-id";
import { useLayoutEditorStore } from "@/stores/layout/layout-editor-store";

interface LayoutEditorProps {
  /**
   * The app column (4.5): the element the canvas decorates, the firewall sits
   * on, and this inspector is a SIBLING of. `null` before the shell's ref has
   * landed, which is the first render only.
   */
  readonly column: HTMLElement | null;
}

/**
 * The mounted editor: the canvas controllers, the edit firewall, and the
 * inspector docked beside the app (L-01, L-05).
 *
 * Mounted unconditionally by `app-shell.tsx` and inert until a session opens -
 * `useLayoutCanvas` does nothing without one, and this renders nothing. The
 * door itself is `lib/layout/editor-session.ts`; nothing here decides whether
 * the editor should be open, only what being open looks like.
 */
export function LayoutEditor(props: LayoutEditorProps): ReactNode {
  const { column } = props;
  const live = useLayoutEditorStore((state) => state.session !== null);
  const dockMode = useLayoutEditorStore((state) => state.dockMode);
  const windowId = useDesktopWindowId();
  const [inspector, setInspector] = useState<HTMLDivElement | null>(null);
  const floatPosition = useFloatingDock(inspector);

  // The panel is this file's markup, so the door is HANDED it rather than
  // going looking for it: `editor-motion.ts` animates the exit on this node.
  const bindInspector = useCallback((node: HTMLDivElement | null) => {
    setInspector(node);
    setLayoutInspectorNode(node);
  }, []);

  // Unconditional, with the column: the hook sets and removes
  // `data-layout-editing` itself, so the attribute can never outlive a session.
  useLayoutCanvas(column);

  useEffect(() => {
    initializeLayoutEditorWindow(windowId);
  }, [windowId]);

  // One window holds the editor open (L-32). Watched for the whole life of the
  // shell rather than per session, because the lease that matters here is the
  // one ANOTHER window took while this one was not looking.
  useEffect(
    () =>
      watchLayoutEditorLease(() => {
        closeLayoutEditor("lease-lost");
      }),
    [],
  );

  // The shell going away is a different concern from another window's lease,
  // and it does not go through the door's motion: a sign-out or a window
  // teardown has no document left to glide and no inspector left to slide out.
  useEffect(
    () => () => {
      abandonLayoutEditorSession();
    },
    [],
  );

  useEffect(() => {
    if (!live || column === null || inspector === null) return;
    return installEditFirewall({
      column,
      focusTarget: () =>
        inspector.querySelector<HTMLElement>("[data-layout-inspector-shell]"),
    });
  }, [live, column, inspector]);

  // Undo and Redo live on the editor, not on whatever has focus: every gesture
  // in a session is one step on the same stack (L-18). Deliberately not
  // exempting text fields - the only field in the editor is the region filter,
  // and inside the editor Mod+Z means the layout.
  useEffect(() => {
    if (!live) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.altKey || !(event.metaKey || event.ctrlKey)) return;
      if (event.key.toLowerCase() !== "z") return;
      event.preventDefault();
      const state = useLayoutEditorStore.getState();
      if (event.shiftKey) state.redo();
      else state.undo();
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [live]);

  // Escape's one owner while a session is live (L-31, C-26), for the same
  // reason as the chord above: the ladder is a fact about the SESSION, not
  // about what has focus. It used to be a listener on the inspector panel,
  // which selecting a region killed - the focused index row unmounted, focus
  // fell back to `<body>`, and the key never passed through the panel again
  // (I-02). Nothing has to be fought for here: the filter's clear and the
  // sortable list's grab-cancel both stop the native event below this node,
  // and a layer that took focus answers for itself (see `ownsItsOwnEscape`).
  useEffect(() => {
    if (!live) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (ownsItsOwnEscape(event.target)) return;
      event.preventDefault();
      if (useLayoutEditorStore.getState().popInspectorLevel()) return;
      closeLayoutEditor("escape");
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [live]);

  if (!live) return null;

  return (
    <div
      ref={bindInspector}
      data-layout-inspector
      data-dock-mode={dockMode}
      style={
        dockMode === "float"
          ? {
              transform: `translate3d(${floatPosition.x}px, ${floatPosition.y}px, 0)`,
            }
          : undefined
      }
      className="h-safe-dvh"
    >
      {/* Which host is drawing the form, published ONCE at the root of it
        (L-03) - the same place and the same way `layout-settings-panel.tsx`
        publishes `"page"`. It used to ride on `RegionSection`'s own `host`
        prop, which only ever arrived here and only ever said `"inspector"`,
        so the prop carried a branch the page never took. */}
      <LayoutFormHostContext value="inspector">
        <InspectorBody />
      </LayoutFormHostContext>
    </div>
  );
}

/**
 * Which of the three screens the inspector shows, read off the editor store's
 * own ladder (index -> section -> provider level).
 *
 * Separate from the root so that none of it - least of all the notification
 * feed the relay row reads - is subscribed to while the editor is closed.
 */
function InspectorBody(): ReactNode {
  const selected = useLayoutEditorStore((state) => state.selected);
  const level = useLayoutEditorStore((state) => state.level);

  let body: ReactNode;
  if (level !== null) {
    body = (
      <>
        {/* Keyed per level, so arriving at a deeper one re-homes focus onto
          its own way back rather than leaving it on the row that opened it. */}
        <InspectorBackRow
          key={`provider-${level.providerId}`}
          label={regionFacts("usageLimits").name}
          onBack={popLevel}
        />
        <ProviderLevel providerId={level.providerId} />
      </>
    );
  } else if (selected !== null) {
    body = (
      <>
        <InspectorBackRow
          key={`section-${selected}`}
          label="All regions"
          onBack={popLevel}
        />
        {/* Keyed on the region: the section holds per-region local state (the
          Fine-tune disclosure), and an unkeyed element would carry one
          region's open state into the next (G1-20). */}
        <RegionSection
          key={selected}
          regionId={selected}
          onOpenProvider={(providerId) => {
            if (!isUsageProviderId(providerId)) return;
            useLayoutEditorStore
              .getState()
              .openLevel({ kind: "usage-provider", providerId });
          }}
        />
      </>
    );
  } else {
    body = (
      // Preview-without-writing (L-43, L-65): the editor store's session-only
      // preview tier, which the override seam prefers while it is set. Nothing
      // reaches the layout store or the history, so leaving the card restores
      // the real values in one render and a click still commits as one undo
      // step through `recordGesture`.
      <InspectorIndex
        onPreviewPreset={(presetId) => {
          useLayoutEditorStore.getState().setPreviewPreset(presetId);
        }}
      />
    );
  }

  return <InspectorShell onExit={exit}>{body}</InspectorShell>;
}

function popLevel(): void {
  useLayoutEditorStore.getState().popInspectorLevel();
}

function exit(reason: LayoutEditorExitReason): void {
  closeLayoutEditor(reason);
}

/**
 * An open overlay owns Escape for its own layer.
 *
 * A Radix layer that has taken focus - the canvas's own quick-verb context
 * menu, a dialog, a popover - dismisses itself on Escape, and a ladder step in
 * the same press would close the menu AND leave the level the user was
 * reading. Read off the event's target rather than off a layer count, because
 * this listener is installed when the session opens and a layer that mounts
 * later is dismissed AFTER it, so `defaultPrevented` alone answers too late.
 */
function ownsItsOwnEscape(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return (
    target.closest(
      '[data-radix-popper-content-wrapper],[role="dialog"],[role="menu"],[role="listbox"]',
    ) !== null
  );
}

function isUsageProviderId(id: string): id is RateLimitProviderId {
  return USAGE_PROVIDER_IDS.some((candidate) => candidate === id);
}
