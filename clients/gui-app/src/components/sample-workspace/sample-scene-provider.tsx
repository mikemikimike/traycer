import { useLayoutEditorFitsWindow } from "@/lib/layout/editor-width";
import { tabCommandCoordinator } from "@/stores/tabs/tab-command-coordinator";
import { useEffect, type ReactNode } from "react";
import { useLayoutEditorStore } from "@/stores/layout/layout-editor-store";
import { SampleSceneContext } from "./sample-scene-context";
/** Covers the real shell as well as the sample body. */
export function SampleSceneProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  // The sample workspace is a desktop-width scene: below the editor's width
  // threshold the full-width Layout page is the form, so a sample tab left
  // open on a narrow window has nothing to be a canvas for. The SAME threshold
  // the door and the session watcher read (L-64), never a second breakpoint.
  const fits = useLayoutEditorFitsWindow();
  useEffect(() => {
    if (!fits)
      tabCommandCoordinator.closeRefAfterConfirmed({
        kind: "sample-workspace",
        id: "sample-workspace",
      });
  }, [fits]);
  const sample = useLayoutEditorStore(
    (state) => state.session?.scene === "sample",
  );
  return (
    <SampleSceneContext.Provider value={sample}>
      {children}
    </SampleSceneContext.Provider>
  );
}
