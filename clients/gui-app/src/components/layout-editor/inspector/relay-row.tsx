import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useLayoutEditorStore } from "@/stores/layout/layout-editor-store";

/**
 * The relay row (L-17, 4.8): the editor's one in-editor announcement channel
 * while the app column is `aria-hidden`. `relayRaised` itself is set by the
 * attention-notification watcher a later ticket wires up; this component only
 * draws it and quiets it.
 *
 * `.relay` in the prototype. `Done` here only lowers the flag - it does not
 * exit the session, which belongs to `editor-session.ts` (ticket 07).
 */
export function RelayRow(): ReactNode {
  const relayRaised = useLayoutEditorStore((state) => state.relayRaised);
  if (!relayRaised) return null;
  return (
    <div className="flex items-center gap-2 border-b border-border bg-card px-3 py-2 text-ui-sm">
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-success" />
      <span className="min-w-0 flex-1">An agent is waiting for you</span>
      <Button
        type="button"
        variant="muted"
        size="sm"
        onClick={() => {
          useLayoutEditorStore.getState().setRelayRaised(false);
        }}
      >
        Done
      </Button>
    </div>
  );
}
