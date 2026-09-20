import { useEffect, useRef, type ReactNode } from "react";
import { PanelLeft, PanelRight, PictureInPicture2, Redo2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import { cn } from "@/lib/utils";
import { RelayRow } from "@/components/layout-editor/inspector/relay-row";
import type { LayoutDockMode } from "@/stores/layout/layout-editor-store";
import { useLayoutEditorStore } from "@/stores/layout/layout-editor-store";
import { getLayoutSnapshot } from "@/stores/layout/layout-store";

interface InspectorShellProps {
  /**
   * Leaving the editor. Session exit (`editor-session.ts`) is ticket 07's;
   * this component is unwired, so its caller decides what "Done" does.
   */
  readonly onDone: () => void;
  readonly children: ReactNode;
}

const DOCK_MODES: ReadonlyArray<{
  readonly mode: LayoutDockMode;
  readonly label: string;
  readonly icon: ReactNode;
}> = [
  { mode: "right", label: "Dock right", icon: <PanelRight /> },
  { mode: "left", label: "Dock left", icon: <PanelLeft /> },
  { mode: "float", label: "Float", icon: <PictureInPicture2 /> },
];

/**
 * The inspector's own chrome (L-05): header (title, dock mode, Undo/Redo,
 * Done), the relay slot, the scrollable body the caller supplies, and the
 * footer's Discard changes. `.insp-head` / `.insp-foot` in the prototype.
 *
 * 320px is the plan's one frozen inspector width (section 6); every other
 * measurement here is fluid, so the SAME shell also wraps the full-width
 * `Settings > Layout` host's card without carrying a dock-only width (L-03).
 */
export function InspectorShell(props: InspectorShellProps): ReactNode {
  const { onDone } = props;
  const dockMode = useLayoutEditorStore((state) => state.dockMode);
  const canUndo = useLayoutEditorStore((state) => state.history.past.length > 0);
  const canRedo = useLayoutEditorStore(
    (state) => state.history.future.length > 0,
  );
  const canDiscard = useLayoutEditorStore(
    (state) =>
      state.entrySnapshot !== null &&
      JSON.stringify(state.entrySnapshot) !== JSON.stringify(getLayoutSnapshot()),
  );
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Escape (L-31: "Escape walks back via the editor store's
  // popInspectorLevel") is attached imperatively rather than as a JSX
  // `onKeyDown` prop: the root here is a passive layout container, not an
  // interactive element, and an imperative `addEventListener` (unlike a JSX
  // handler prop) carries no ARIA-role expectation for jsx-a11y to check.
  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key !== "Escape") return;
      event.preventDefault();
      const wentBack = useLayoutEditorStore.getState().popInspectorLevel();
      if (!wentBack) onDone();
    }
    node.addEventListener("keydown", handleKeyDown);
    return () => {
      node.removeEventListener("keydown", handleKeyDown);
    };
  }, [onDone]);

  return (
    <div
      ref={rootRef}
      className="flex h-full min-h-0 max-w-full flex-col bg-background"
    >
      <div className="flex h-11 shrink-0 items-center gap-1.5 border-b border-border pr-2.5 pl-3.5">
        <span className="text-ui-sm font-medium tracking-[0.01em]">Layout</span>
        <span className="flex-1" />
        <div
          role="group"
          aria-label="Dock mode"
          className="flex items-center gap-0.5"
        >
          {DOCK_MODES.map((entry) => (
            <TooltipWrapper
              key={entry.mode}
              label={entry.label}
              side="bottom"
              sideOffset={undefined}
              align={undefined}
            >
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={entry.label}
                aria-pressed={dockMode === entry.mode}
                onClick={() => {
                  useLayoutEditorStore.getState().setDockMode(entry.mode);
                }}
              >
                {entry.icon}
              </Button>
            </TooltipWrapper>
          ))}
        </div>
        <span className="mx-0.5 h-4 w-px shrink-0 bg-border" />
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Undo"
          disabled={!canUndo}
          onClick={() => {
            useLayoutEditorStore.getState().undo();
          }}
        >
          <Undo2 />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Redo"
          disabled={!canRedo}
          onClick={() => {
            useLayoutEditorStore.getState().redo();
          }}
        >
          <Redo2 />
        </Button>
        <Button type="button" size="sm" onClick={props.onDone}>
          Done
        </Button>
      </div>
      <RelayRow />
      <div className={cn("min-h-0 flex-1 overflow-auto")}>{props.children}</div>
      <div className="flex shrink-0 items-center border-t border-border px-2.5 py-1.5">
        <Button
          type="button"
          variant="muted"
          size="sm"
          disabled={!canDiscard}
          onClick={() => {
            useLayoutEditorStore.getState().discard();
          }}
        >
          Discard changes
        </Button>
      </div>
    </div>
  );
}
