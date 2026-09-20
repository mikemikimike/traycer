import { tabCommandCoordinator } from "@/stores/tabs/tab-command-coordinator";
import { SampleWorkspaceBody } from "./sample-workspace-body";
import { useEffect } from "react";
import { useTabsStore } from "@/stores/tabs/store";
import { useLayoutEditorStore } from "@/stores/layout/layout-editor-store";

// A window has one canonical sample tab; a replacement mount takes ownership.
let activationGeneration = 0;

/**
 * The sample canvas (L-15), which exists only for a live sample-scene session.
 *
 * The editor's one door decides the scene and opens this tab; this surface
 * owns the other end of that lifetime. Closing the tab ends the session, and a
 * session that ended elsewhere (Done, Discard, a lost lease) closes the tab -
 * so the two can never be left disagreeing about whether the editor is open.
 *
 * The width threshold is NOT read here: `SampleSceneProvider` covers the real
 * shell as well as this body, and closes the tab on a narrow window.
 */
export function SampleWorkspaceSurface({ tabId }: { readonly tabId: string }) {
  const active = useTabsStore(
    (state) => state.activeItemId === `tab:sample-workspace:${tabId}`,
  );
  useEffect(() => {
    const generation = ++activationGeneration;
    if (!active) return;
    const session = useLayoutEditorStore.getState().session;
    return () => {
      // StrictMode immediately sets up the same activation again. A real
      // unmount has no next setup and releases ownership in this microtask.
      queueMicrotask(() => {
        if (
          activationGeneration === generation &&
          session?.scene === "sample" &&
          useLayoutEditorStore.getState().session === session
        )
          useLayoutEditorStore.getState().endSession();
      });
    };
  }, [active]);
  useEffect(() => {
    const closeWithoutSession = (): void => {
      if (useLayoutEditorStore.getState().session?.scene === "sample") return;
      tabCommandCoordinator.closeRefAfterConfirmed({
        kind: "sample-workspace",
        id: tabId,
      });
    };
    return useLayoutEditorStore.subscribe(closeWithoutSession);
  }, [tabId]);
  return (
    <div className="flex h-full min-h-0 flex-col" data-sample-workspace>
      <p className="shrink-0 border-b px-4 py-2 text-ui-sm text-muted-foreground">
        Sample content. Changes apply to your layout.
      </p>
      <SampleWorkspaceBody />
    </div>
  );
}
