/**
 * R1: the tooltip guard (`tooltip.tsx`'s `OPEN_POPUP_TRIGGER` check) must
 * suppress a tooltip whose trigger sits ANYWHERE in an open popup trigger's
 * composed subtree - not only when the tooltip and the popup share one
 * element, and not by searching the whole document.
 *
 * Three real callers compose a TooltipWrapper and a Menu/Popover trigger onto
 * different elements of the same control:
 * - `ToolbarActionButton`: the wrapper's trigger is an outer `<span>`; Base's
 *   menu-trigger ARIA lands on the inner `<button>` (a DESCENDANT case).
 * - `StatusBarResourceSegment`: the per-metric tooltip trigger is an inner
 *   `<span>`; the Popover's `aria-haspopup`/`aria-expanded` land on the
 *   ANCESTOR `<button>`.
 * - `GitDiffRepoSwitcher`: `GitDiffCountBadges`' tooltip sits on a badge
 *   nested inside `WorktreePickerTrigger`'s ANCESTOR `<button>`.
 *
 * `tooltipTextFor`/`tooltipTextNear` (`tooltip-probe.ts`) open via focus, not
 * hover: focus carries no open delay, so these need no fake timers.
 * `tooltip-timing.test.tsx` keeps the same-element/disclosure/delay cases;
 * this file is the composition regressions only.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  tooltipTextFor,
  tooltipTextNear,
} from "@/components/ui/__tests__/tooltip-probe";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ToolbarActionButton } from "@/editor-core/toolbar/toolbar-action-button";
import { StatusBarResourceSegment } from "@/components/layout/status-bar/status-bar-resource-segment";
import {
  DEFAULT_STATUS_BAR_LAYOUT,
  useLayoutStore,
} from "@/stores/settings/layout-store";
import { GitDiffRepoSwitcher } from "@/components/epic-canvas/git-diff/git-diff-repo-switcher";
import type { WorktreeBindingSelectorRowV12 } from "@traycer/protocol/host";

// Only the remote capability data seam is substituted. StatusBarResourceSegment,
// its layout store, TooltipWrapper, Popover and the DOM stay production.
vi.mock("@/hooks/resources/use-global-resources-unsupported", () => ({
  useGlobalResourcesUnsupported: () => false,
}));

afterEach(() => {
  cleanup();
  useLayoutStore.setState({ statusBar: DEFAULT_STATUS_BAR_LAYOUT });
});

const REPO_ROW: WorktreeBindingSelectorRowV12 = {
  hostId: "host-1",
  runningDir: "/repo",
  workspacePath: "/repo",
  worktreePath: null,
  mode: "local",
  isGitRepo: true,
  repoIdentifier: { owner: "acme", repo: "repo" },
  branch: "main",
  isPrimary: true,
  isImported: false,
  setupState: "not_required",
  disabledReason: null,
  sources: [],
  isGitResolvePending: false,
};

describe("tooltip guard on composed popup triggers (R1)", () => {
  it("stays closed on ToolbarActionButton's outer span while its inner Menu trigger is expanded", () => {
    render(
      <DropdownMenu modal={false} open>
        <DropdownMenuTrigger
          render={
            <ToolbarActionButton
              icon={null}
              label="Aa"
              tooltip="Formatting"
              aria-label="Formatting"
            />
          }
        />
        <DropdownMenuContent>
          <DropdownMenuItem>Bold</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    const button = screen.getByRole("button", { name: "Formatting" });
    expect(button.getAttribute("aria-haspopup")).toBe("menu");
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(tooltipTextNear(button)).toBeNull();
  });

  it("stays closed on StatusBarResourceSegment's no-metrics tooltip span while its Popover trigger button is expanded", () => {
    const previous = useLayoutStore.getState().statusBar;
    useLayoutStore.setState({
      statusBar: {
        ...previous,
        resources: { ...previous.resources, metrics: [] },
      },
    });

    render(
      <Popover open>
        <PopoverTrigger
          render={
            <StatusBarResourceSegment
              hostId={null}
              hostLabel="Probe host"
              hasExplicitPick={false}
            />
          }
        />
        <PopoverContent>Resource panel</PopoverContent>
      </Popover>,
    );
    const button = screen.getByTestId("status-bar-resource-segment");
    expect(button.getAttribute("aria-haspopup")).toBe("dialog");
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(
      tooltipTextNear(screen.getByTestId("status-bar-resource-no-metrics")),
    ).toBeNull();
  });

  it("stays closed on GitDiffRepoSwitcher's changed-file badge tooltip while its Popover trigger is expanded", () => {
    render(
      <GitDiffRepoSwitcher
        open
        onOpenChange={() => undefined}
        roots={[{ row: REPO_ROW, fileChangeCount: 4, moduleChangeCount: 1 }]}
        activeRootSubmodules={[]}
        selected={{
          hostId: "host-1",
          rootRunningDir: "/repo",
          repoRoot: "/repo",
        }}
        onSelectRoot={() => undefined}
        hostSection={null}
        autoFocusSearch={false}
        triggerClassName={undefined}
        contentClassName={undefined}
        triggerTestId="repo-composition-trigger"
        contentTestId="repo-composition-content"
      />,
    );
    const button = screen.getByTestId("repo-composition-trigger");
    expect(button.getAttribute("aria-haspopup")).toBe("dialog");
    expect(button.getAttribute("aria-expanded")).toBe("true");
    const badge = button.querySelector('[aria-label="4 changed files"]');
    if (badge === null) throw new Error("missing file-count badge");
    expect(tooltipTextNear(badge)).toBeNull();
  });

  it("lets a previously-blocked tooltip open once that same popup trigger closes", () => {
    const fixture = (expanded: boolean) => (
      <TooltipProvider delay={0}>
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-haspopup="dialog"
                aria-expanded={expanded}
              >
                Cycle
              </button>
            }
          />
          <TooltipContent>Cycle help</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
    const view = render(fixture(true));
    expect(
      tooltipTextFor(screen.getByRole("button", { name: "Cycle" })),
    ).toBeNull();

    view.rerender(fixture(false));
    expect(tooltipTextFor(screen.getByRole("button", { name: "Cycle" }))).toBe(
      "Cycle help",
    );
  });
});

describe("tooltip guard boundaries (R1)", () => {
  it("still opens when aria-haspopup is explicitly false, even with aria-expanded true", () => {
    render(
      <TooltipProvider delay={0}>
        <Tooltip>
          <TooltipTrigger
            render={
              <button type="button" aria-haspopup="false" aria-expanded="true">
                Trigger
              </button>
            }
          />
          <TooltipContent>Tip</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );
    expect(
      tooltipTextFor(screen.getByRole("button", { name: "Trigger" })),
    ).toBe("Tip");
  });

  it("suppresses on Base's own data-popup-open marker alone, with no matching aria-haspopup/aria-expanded pair", () => {
    render(
      <TooltipProvider delay={0}>
        <Tooltip>
          <TooltipTrigger
            render={
              <button type="button" data-popup-open="">
                Trigger
              </button>
            }
          />
          <TooltipContent>Tip</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );
    expect(
      tooltipTextFor(screen.getByRole("button", { name: "Trigger" })),
    ).toBeNull();
  });

  it("does not suppress a tooltip whose only relation to an open popup is sharing the document", () => {
    render(
      <>
        <DropdownMenu modal={false} open>
          <DropdownMenuTrigger
            render={<button type="button">Elsewhere</button>}
          />
          <DropdownMenuContent>
            <DropdownMenuItem>Item</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <TooltipProvider delay={0}>
          <Tooltip>
            <TooltipTrigger render={<button type="button">Unrelated</button>} />
            <TooltipContent>Tip</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </>,
    );
    expect(
      tooltipTextFor(screen.getByRole("button", { name: "Unrelated" })),
    ).toBe("Tip");
  });

  it("keeps a disabled-reason tooltip open on a plain disabled trigger wrapped in a span (EmptyRecentFolderTrigger's disabled branch)", () => {
    // That branch wraps a plain (non-popup) disabled trigger in a span rather
    // than a PopoverTrigger, precisely because disabled means no popover -
    // so the guard must never mistake this shape for a suppressed one.
    render(
      <TooltipProvider delay={0}>
        <Tooltip>
          <TooltipTrigger
            render={
              <span data-testid="disabled-reason-wrapper">
                <button type="button" disabled>
                  Add folder
                </button>
              </span>
            }
          />
          <TooltipContent>Nothing to add here</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );
    expect(tooltipTextFor(screen.getByTestId("disabled-reason-wrapper"))).toBe(
      "Nothing to add here",
    );
  });
});
