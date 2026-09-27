/**
 * The pieces of a Home status row that both views draw - the table
 * (`home-status-table.tsx`) and the board (`home-status-kanban.tsx`): the
 * note, the agent chip with the row's age and stale
 * mark, the dismiss button and the summary line. One definition each, so the
 * two views cannot drift on what a row says.
 */
import type { ReactNode } from "react";
import { X } from "lucide-react";
import type {
  HomeStatus,
  HomeStatusRow,
} from "@traycer/protocol/notifications/home-status-room";
import { Button } from "@/components/ui/button";
import { normalizeProviderId } from "@/components/home/data/landing-options";
import { HarnessIcon } from "@/components/home/pickers/harness-icon";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import { useRegisteredEpicAgentActivityTiers } from "@/lib/epic-selectors";
import type { HomeStatusThresholds } from "@/lib/home-focus/home-status-thresholds";
import { useCompactRelativeTime } from "@/lib/relative-time";
import { cn } from "@/lib/utils";
import { TraycerMarkdown } from "@/markdown/traycer-markdown";
import {
  HOME_STATUS_DISPLAY,
  HOME_STATUS_ORDER,
} from "@/lib/home-focus/home-status-display";

export type HomeStatusOpenAgent = (
  epicId: string,
  agentId: string,
  hostId: string | null,
) => void;

/** What either view draws from: the board's rows and how to act on them. */
export interface HomeStatusViewProps {
  readonly rows: ReadonlyArray<HomeStatusRow>;
  readonly now: number;
  /** When a row reads as stale, per status - this device's setting. */
  readonly thresholds: HomeStatusThresholds;
  readonly onDismiss: (key: string) => void;
  readonly onOpenAgent: HomeStatusOpenAgent;
}

/** `2 need you · 3 in progress · 2 done`, zero segments omitted. */
export function HomeStatusSummary(props: {
  readonly rows: ReadonlyArray<HomeStatusRow>;
}): ReactNode {
  const counts = new Map<HomeStatus, number>();
  for (const row of props.rows) {
    counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
  }
  const segments = HOME_STATUS_ORDER.flatMap((status) => {
    const count = counts.get(status) ?? 0;
    return count === 0 ? [] : [{ status, count }];
  });
  return (
    <p
      data-testid="home-status-summary"
      className="flex flex-wrap items-center gap-x-1 text-ui-xs text-muted-foreground"
    >
      {segments.map((segment, index) => (
        <span key={segment.status} className="flex items-center gap-1">
          {index === 0 ? null : (
            <span aria-hidden className="text-muted-foreground/60">
              ·
            </span>
          )}
          <span
            className={cn(
              "font-medium",
              HOME_STATUS_DISPLAY[segment.status].textClass,
            )}
          >
            {segment.count}{" "}
            {HOME_STATUS_DISPLAY[segment.status].summary(segment.count)}
          </span>
        </span>
      ))}
    </p>
  );
}

/** The row's note as sanitized inline markdown, or nothing for an empty one. */
export function HomeStatusNote(props: { readonly note: string }): ReactNode {
  if (props.note.length === 0) return null;
  return (
    <TraycerMarkdown
      className="[&_p]:my-0"
      proseSize="compact"
      components={null}
      remarkPlugins={null}
      rehypePlugins={null}
      quotable={false}
      isStreaming={false}
    >
      {props.note}
    </TraycerMarkdown>
  );
}

export function HomeStatusDismissButton(props: {
  readonly row: HomeStatusRow;
  readonly onDismiss: (key: string) => void;
}): ReactNode {
  const { row, onDismiss } = props;
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      aria-label={`Dismiss ${row.item}`}
      data-testid="home-status-dismiss"
      onClick={() => onDismiss(row.key)}
    >
      <X aria-hidden />
    </Button>
  );
}

/**
 * The agent that last wrote the row, as a chip that opens its chat, with a
 * live dot while that agent is mid-turn - then the row's age, and `stale`
 * when the row is.
 *
 * `folds` is the table's: under its `@max-[36rem]` fold the chip drops its
 * outline and reads as the `agent · time` line. A board card keeps the chip
 * whatever its width.
 */
export function HomeStatusLastUpdate(props: {
  readonly row: HomeStatusRow;
  readonly stale: boolean;
  readonly folds: boolean;
  readonly onOpenAgent: HomeStatusOpenAgent;
}): ReactNode {
  const { row, stale, folds, onOpenAgent } = props;
  const tiers = useRegisteredEpicAgentActivityTiers(row.epicId);
  const live = tiers.get(row.agentId) === "turn";
  const name = row.agentName.trim().length > 0 ? row.agentName : "Agent";
  // The row is user-writable and older hosts write no harness, so an id this
  // build does not know draws no icon rather than a placeholder.
  const harnessId =
    row.harnessId === null ? null : normalizeProviderId(row.harnessId);
  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-2 text-ui-xs text-muted-foreground",
        folds && "@max-[36rem]:gap-1",
      )}
    >
      {/* Capped and truncated: agent titles run long ("Update Home Status
          Board"), and an uncapped chip took the width the note needs. The
          tooltip keeps the whole name reachable. */}
      <TooltipWrapper
        label={name}
        side="top"
        sideOffset={undefined}
        align={undefined}
      >
        <button
          type="button"
          onClick={() => onOpenAgent(row.epicId, row.agentId, row.hostId)}
          data-testid="home-status-agent"
          data-live={live ? "true" : undefined}
          className={cn(
            "inline-flex max-w-48 min-w-0 items-center gap-1 rounded-full border border-border px-1.5 py-0.5 text-foreground outline-none hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring/50",
            folds &&
              "@max-[36rem]:border-transparent @max-[36rem]:px-0 @max-[36rem]:text-muted-foreground",
          )}
        >
          {harnessId === null ? null : (
            <span
              className="inline-flex shrink-0"
              data-testid="home-status-agent-harness"
              data-harness-id={harnessId}
            >
              <HarnessIcon harnessId={harnessId} className="size-3.5" />
            </span>
          )}
          <span className="truncate" data-testid="home-status-agent-name">
            {name}
          </span>
          {live ? (
            <span
              role="img"
              aria-label="Working now"
              data-testid="home-status-agent-live"
              className="size-1.5 shrink-0 rounded-full bg-success"
            />
          ) : null}
        </button>
      </TooltipWrapper>
      <span aria-hidden className="text-muted-foreground/60">
        ·
      </span>
      <HomeStatusAge updatedAt={row.updatedAt} />
      {stale ? (
        <>
          <span aria-hidden className="text-muted-foreground/60">
            ·
          </span>
          <span data-testid="home-status-stale">stale</span>
        </>
      ) : null}
    </div>
  );
}

/** Its own leaf, so the shared minute tick repaints the label alone. */
function HomeStatusAge(props: { readonly updatedAt: number }): ReactNode {
  const label = useCompactRelativeTime(props.updatedAt);
  return <span data-testid="home-status-age">{label}</span>;
}
