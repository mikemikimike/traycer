import type { ReactNode } from "react";
import {
  PanelLeft,
  PanelRight,
  PictureInPicture2,
  Redo2,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import { cn } from "@/lib/utils";
import { RelayRow } from "@/components/layout-editor/inspector/relay-row";
import type { LayoutDockMode } from "@/stores/layout/layout-editor-store";
import { useLayoutEditorStore } from "@/stores/layout/layout-editor-store";

interface InspectorShellProps {
  /**
   * Leaving the editor, and how (5.3): the Done button, or Discard changes -
   * which restores the entry snapshot on the way out rather than leaving the
   * user in an editor they just emptied. The caller owns both, because ending
   * a session is the door's job; the third way out, an Escape that walked off
   * the bottom rung of the ladder, is the editor root's (`layout-editor.tsx`)
   * and never belonged to this chrome.
   */
  readonly onExit: (reason: "done" | "discard") => void;
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
 * The dock is its one host. L-03's "one form, two hosts" is about the SECTION
 * TREE - `RegionSection` and `PresetsBlock`, which `Settings > Layout` renders
 * inside its own `SettingsPanelShell` - not about this chrome: Undo, Redo, the
 * dock-mode group and Done are the instrument panel's, and the full-width page
 * has no use for any of them.
 *
 * 320px is the plan's one frozen inspector width (section 6); every other
 * measurement here is fluid, so the panel fits whatever the dock gives it.
 */
export function InspectorShell(props: InspectorShellProps): ReactNode {
  const { onExit } = props;
  const dockMode = useLayoutEditorStore((state) => state.dockMode);
  const canUndo = useLayoutEditorStore(
    (state) => state.history.past.length > 0,
  );
  const canRedo = useLayoutEditorStore(
    (state) => state.history.future.length > 0,
  );
  // A boolean the gesture paths maintain, never a selector that serialises the
  // layout triple on every editor-store notification (G1-04).
  const canDiscard = useLayoutEditorStore((state) => state.dirty);

  return (
    <div
      // Focusable but not a tab stop: the firewall bounces focus that lands on
      // the app column back to here, so the bounce has to land ON it rather
      // than above it (4.4).
      tabIndex={-1}
      data-layout-inspector-shell
      className="flex h-full min-h-0 max-w-full flex-col bg-background outline-none"
    >
      {/* The float mode's drag handle (L-38): `dock-modes.ts` picks a drag up
        here and nowhere else, so the body scrolls rather than moves. */}
      <div
        data-layout-inspector-header
        className="flex h-11 shrink-0 items-center gap-1.5 border-b border-border pr-2.5 pl-3.5"
      >
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
        <Button
          type="button"
          size="sm"
          onClick={() => {
            onExit("done");
          }}
        >
          Done
        </Button>
      </div>
      <RelayRow
        onDone={() => {
          onExit("done");
        }}
      />
      <div className={cn("min-h-0 flex-1 overflow-auto")}>{props.children}</div>
      <div className="flex shrink-0 items-center border-t border-border px-2.5 py-1.5">
        <Button
          type="button"
          variant="muted"
          size="sm"
          disabled={!canDiscard}
          onClick={() => {
            onExit("discard");
          }}
        >
          Discard changes
        </Button>
      </div>
    </div>
  );
}
