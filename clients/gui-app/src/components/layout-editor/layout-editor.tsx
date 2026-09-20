import { useEffect, useState, type ReactNode } from "react";
import "@/components/layout-editor/layout-editor.css";
import { installEditFirewall } from "@/components/layout-editor/canvas/edit-firewall";
import { useLayoutCanvas } from "@/components/layout-editor/canvas/layout-canvas";
import { useFloatingDock } from "@/components/layout-editor/inspector/dock-modes";
import { InspectorIndex } from "@/components/layout-editor/inspector/inspector-index";
import { InspectorShell } from "@/components/layout-editor/inspector/inspector-shell";
import { ProviderLevel } from "@/components/layout-editor/inspector/provider-level";
import { RegionSection } from "@/components/layout-editor/inspector/region-section";
import {
  initializeLayoutEditorWindow,
  watchLayoutEditorLease,
} from "@/lib/layout/editor-lease";
import {
  closeLayoutEditor,
  type LayoutEditorExitReason,
} from "@/lib/layout/editor-session";
import { USAGE_PROVIDER_IDS } from "@/lib/layout/layout-arrangement";
import type { RateLimitProviderId } from "@/lib/rate-limit-providers";
import { useDesktopWindowId } from "@/lib/windows/desktop-window-id";
import { useBlockingAttentionCount } from "@/stores/notifications/merged-notifications";
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

  // Unconditional, with the column: the hook sets and removes
  // `data-layout-editing` itself, so the attribute can never outlive a session.
  useLayoutCanvas(column);

  useEffect(() => {
    initializeLayoutEditorWindow(windowId);
  }, [windowId]);

  // One window holds the editor open (L-32). Watched for the whole life of the
  // shell rather than per session, because the lease that matters here is the
  // one ANOTHER window took while this one was not looking.
  useEffect(() => {
    const unwatch = watchLayoutEditorLease(() => {
      closeLayoutEditor("lease-lost");
    });
    return () => {
      unwatch();
      closeLayoutEditor("done");
    };
  }, []);

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

  if (!live) return null;

  return (
    <div
      ref={setInspector}
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
      <InspectorBody />
    </div>
  );
}

/**
 * Which of the three screens the inspector shows, read off the editor store's
 * own ladder (index -> section -> provider level), plus the relay signal.
 *
 * Separate from the root so that none of it - least of all the notification
 * feed the relay reads - is subscribed to while the editor is closed.
 */
function InspectorBody(): ReactNode {
  const selected = useLayoutEditorStore((state) => state.selected);
  const level = useLayoutEditorStore((state) => state.level);
  // The app under the editor stays alive, and anything that needs the user
  // relays as a quiet row rather than taking them out of the editor (L-17).
  const blocking = useBlockingAttentionCount();

  useEffect(() => {
    useLayoutEditorStore.getState().setRelayRaised(blocking > 0);
  }, [blocking]);

  let body: ReactNode;
  if (level !== null) {
    body = (
      <ProviderLevel
        providerId={level.providerId}
        onBack={() => {
          useLayoutEditorStore.getState().popInspectorLevel();
        }}
      />
    );
  } else if (selected !== null) {
    body = (
      <RegionSection
        regionId={selected}
        host="inspector"
        onOpenProvider={(providerId) => {
          if (!isUsageProviderId(providerId)) return;
          useLayoutEditorStore
            .getState()
            .openLevel({ kind: "usage-provider", providerId });
        }}
      />
    );
  } else {
    body = (
      <InspectorIndex
        host="inspector"
        // Preview-without-writing (L-43) needs a preview tier the override
        // seam does not have yet; a preset still commits on click.
        onPreviewPreset={() => {}}
      />
    );
  }

  return <InspectorShell onExit={exit}>{body}</InspectorShell>;
}

function exit(reason: LayoutEditorExitReason): void {
  closeLayoutEditor(reason);
}

function isUsageProviderId(id: string): id is RateLimitProviderId {
  return USAGE_PROVIDER_IDS.some((candidate) => candidate === id);
}
