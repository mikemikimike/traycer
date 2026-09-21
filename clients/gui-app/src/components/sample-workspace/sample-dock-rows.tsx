import type { ReactNode } from "react";
import { ActiveAgentsHeader } from "@/components/chat/chat-active-agents-panel";
import { BackgroundItemsHeader } from "@/components/chat/chat-background-items-panel";
import type { ChatDockSection } from "@/components/chat/chat-dock-compact-context";
import { FileChangeHeader } from "@/components/chat/segments/file-change-segment";
import { Collapsible } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import {
  SAMPLE_AGENT,
  SAMPLE_BACKGROUND,
  SAMPLE_CHANGED_FILE,
} from "@/components/sample-workspace/sample-workspace-scene";

/**
 * The three composer dock rows drawn from sample data (L-16, 4.9).
 *
 * One module, because the same leaves serve two hosts: the sample workspace,
 * where the whole scene is sample, and the user's OWN chat, where a region
 * with nothing live in it still has to be something the editor can point at,
 * hover and drag. Real content is never replaced - these draw only where the
 * chat has none.
 *
 * They are visual leaves under the override seam's passivity contract: the
 * real drawing components, fed from `sample-workspace-scene.ts` and given
 * nothing to call. Nothing here mounts chrome, fetches, opens a stream or
 * writes to a store.
 */
export function SampleDockRow(props: {
  readonly section: ChatDockSection;
}): ReactNode {
  switch (props.section) {
    case "filesChanged":
      return (
        <div className="flex items-center gap-2 px-3 py-2">
          <FileChangeHeader
            filePath={SAMPLE_CHANGED_FILE.path}
            operation="edit"
            additions={SAMPLE_CHANGED_FILE.additions}
            deletions={SAMPLE_CHANGED_FILE.deletions}
            isStreaming={false}
            endState={null}
            reason="snapshot"
            clickHandlers={null}
          />
        </div>
      );
    case "activeAgents":
      return (
        <Collapsible open={false} variant="panel">
          <ActiveAgentsHeader open={false} runningCount={SAMPLE_AGENT.count} />
          <p className="px-3 pb-2 text-ui-xs text-muted-foreground">
            {SAMPLE_AGENT.label}
          </p>
        </Collapsible>
      );
    case "background":
      return (
        <Collapsible open={false} variant="panel">
          <BackgroundItemsHeader
            open={false}
            headerSummary={`${SAMPLE_BACKGROUND.count} running`}
          />
          <p className="px-3 pb-2 text-ui-xs text-muted-foreground">
            {SAMPLE_BACKGROUND.label}
          </p>
        </Collapsible>
      );
  }
}

/**
 * The mark that says a row is standing in for content the chat does not have.
 *
 * `layout-editor.css` keeps it out of sight until the region is hovered or
 * selected (L-16): a canvas covered in permanent "Sample" tags is noise, and
 * the one moment the label matters is the moment the user is pointing at the
 * thing it labels.
 */
export function SampleChip(props: {
  /** Where the mark sits on its host, which only the host knows. */
  readonly className: string;
}): ReactNode {
  return (
    <span
      data-layout-sample-chip
      aria-hidden
      className={cn(
        "pointer-events-none absolute z-10 rounded-sm bg-foreground/8 px-1.5 text-overline font-medium uppercase text-muted-foreground",
        props.className,
      )}
    >
      Sample
    </span>
  );
}
