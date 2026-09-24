import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorktreeOwnerMetadataTooltip } from "@/components/worktree/worktree-owner-metadata";

// The card's three content blocks are stubbed: each one reaches for the epic
// store, the harness catalog and two host queries, none of which this file is
// about. Stubbed as `span`s because `HoverCardContent` renders its children
// inside one.
vi.mock("@/components/worktree/worktree-owner-settings-header", () => ({
  WorktreeOwnerSettingsHeader: () => <span data-testid="settings-header" />,
}));
vi.mock("@/components/worktree/worktree-pr-metadata", () => ({
  OwnerWorkspaceMetadataContent: () => (
    <span data-testid="workspace-metadata" />
  ),
}));
vi.mock("@/hooks/host/use-host-client-for-host-id", () => ({
  useHostClientForHostId: () => null,
}));
const refreshSpy = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const ownerPrSendRefreshSpy = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/worktree/use-worktree-owner-metadata-query", () => ({
  useWorktreeOwnerMetadata: () => ({
    binding: null,
    worktrees: [],
    workspaces: [],
    isPending: false,
    error: null,
    checkedAt: 1_700_000_000_000,
    isRefreshing: false,
    refresh: refreshSpy,
  }),
}));
// The card now derives its PR pills from `pr.subscribeListForEpic` via this
// hook, not from `useWorktreeOwnerMetadata`'s worktree walk - unmocked, it
// reaches for a real stream client and `useQueryClient()`, neither of which
// this file provides a provider for.
vi.mock("@/hooks/pr/use-owner-pr-references", () => ({
  useOwnerListPrReferences: () => ({
    references: [],
    isPending: false,
    error: false,
    sendRefresh: ownerPrSendRefreshSpy,
  }),
}));

// `hover-card.tsx`'s own default, and the width of the window this whole gate
// exists to cover.
const OPEN_DELAY_MS = 500;

function cardIsOpen(): boolean {
  return document.querySelector('[data-slot="hover-card-content"]') !== null;
}

/**
 * The trigger opens on a TIMER, and skips touch pointers outright.
 *
 * Fires both the pointer event (pointer-type tracking) and the native mouse
 * event the underlying hover hook actually listens on - `fireEvent.pointerEnter`
 * alone dispatches only a `PointerEvent`, and jsdom does not synthesize the
 * companion `mouseenter` a real browser would.
 */
function hoverIn(trigger: HTMLElement): void {
  fireEvent.pointerEnter(trigger, { pointerType: "mouse" });
  fireEvent.mouseEnter(trigger);
}

function hoverOut(trigger: HTMLElement): void {
  fireEvent.pointerLeave(trigger, { pointerType: "mouse" });
  fireEvent.mouseLeave(trigger);
}

function settleOpenDelay(): void {
  act(() => {
    vi.advanceTimersByTime(OPEN_DELAY_MS * 2);
  });
}

function renderTooltip(onClick: (() => void) | undefined): HTMLElement {
  render(
    <WorktreeOwnerMetadataTooltip
      trigger={
        <button type="button" data-testid="row" onClick={onClick}>
          Chat row
        </button>
      }
      title="A complete chat title that should remain visible"
      hostId="host-1"
      epicId="epic-1"
      ownerId="owner-1"
      ownerKind="chat"
      supplementalContent={null}
      side="right"
    />,
  );
  return screen.getByTestId("row");
}

describe("WorktreeOwnerMetadataTooltip hover gate", () => {
  beforeEach(() => {
    // `shouldAdvanceTime` keeps Testing Library's own async plumbing alive
    // while the hover card's own open/close timers stay under our control.
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("opens on a settled hover", () => {
    // Non-regression floor: the gate must not cost the card its actual job.
    const trigger = renderTooltip(undefined);

    hoverIn(trigger);
    settleOpenDelay();

    expect(cardIsOpen()).toBe(true);
  });

  it("shows the owner's full title in the opened card", () => {
    const trigger = renderTooltip(undefined);

    hoverIn(trigger);
    settleOpenDelay();

    expect(
      screen.getByTestId("chat-navigator-hover-title-owner-1").textContent,
    ).toBe("A complete chat title that should remain visible");
  });

  it("labels the row age as a workspace snapshot, not a fresh GitHub check", () => {
    const trigger = renderTooltip(undefined);

    hoverIn(trigger);
    settleOpenDelay();

    const label = screen.getByTestId("owner-workspace-checked-at").textContent;
    expect(label).toMatch(/^Workspace snapshot · /u);
    expect(label).not.toContain("Checked");
  });

  it("swallows an open that lands after the press (the reported race)", () => {
    // THE BUG. The card dismisses on any outside pointerdown - but that
    // dismissal only wires up once the card's content actually mounts, which
    // does not exist yet during the 500ms open delay. A click inside that window is
    // therefore seen by nothing, and the card mounts afterwards over the tab
    // the click just opened, anchored to a row that has moved out from under
    // the pointer - so no pointer-leave is coming to close it either.
    const trigger = renderTooltip(undefined);

    hoverIn(trigger);
    fireEvent.pointerDown(trigger);
    settleOpenDelay();

    expect(cardIsOpen()).toBe(false);
  });

  it("stays shut after click-then-leave, despite an orphaned open timer", () => {
    // THE REPORTED REGRESSION, and the reason the re-arm hangs off
    // pointer-ENTER rather than pointer-leave.
    //
    // The hover-open timer is (re)armed on both `pointerenter` and `focus`
    // without clearing a timer already pending. A real click fires pointerdown
    // and then focuses the row - so two open timers are pending and only the
    // focus one is tracked. Pointer-leave cancels that one; the hover one
    // survives and fires ~500ms later, with the pointer long gone and no
    // pointer-leave left to close what it opens.
    const trigger = renderTooltip(undefined);

    hoverIn(trigger);
    fireEvent.pointerDown(trigger);
    // The focus a click delivers - this is what orphans the first timer.
    // ONE dispatch: Testing Library already pairs `focusin` with `focus`, and
    // firing both would manufacture extra timers rather than reproduce a click.
    fireEvent.focus(trigger);
    hoverOut(trigger);
    settleOpenDelay();

    expect(cardIsOpen()).toBe(false);
  });

  it("does not resurrect the swallowed card when the pointer leaves", () => {
    // The reason the late open is swallowed rather than merely masked: a
    // recorded `hoverOpen` would still be armed, and lifting the press gate on
    // pointer-leave is exactly when it would spring open.
    const trigger = renderTooltip(undefined);
    hoverIn(trigger);
    fireEvent.pointerDown(trigger);
    settleOpenDelay();

    hoverOut(trigger);
    settleOpenDelay();

    expect(cardIsOpen()).toBe(false);
  });

  it("re-arms on the next pointer-enter, not on the leave", () => {
    // The gate is held until a FRESH hover starts, so re-entering must release
    // it - otherwise one click would kill the card for that row until it
    // remounted.
    const trigger = renderTooltip(undefined);
    hoverIn(trigger);
    fireEvent.pointerDown(trigger);
    settleOpenDelay();
    hoverOut(trigger);

    hoverIn(trigger);
    settleOpenDelay();

    expect(cardIsOpen()).toBe(true);
  });

  it("survives the pointer travelling from the row into the card", () => {
    // The one thing this card must not lose: its Refresh button lives inside
    // the content, so the pointer has to be able to cross the 4px gap. This is
    // why the gate has no `onPointerLeave` that clears `hoverOpen` - the card's
    // own close delay owns the travel window, and a leave handler that closed
    // eagerly would make the button unreachable.
    const trigger = renderTooltip(undefined);
    hoverIn(trigger);
    settleOpenDelay();
    expect(cardIsOpen()).toBe(true);

    hoverOut(trigger);
    const content = document.querySelector('[data-slot="hover-card-content"]');
    if (content === null) throw new Error("expected the card to be mounted");
    // `mouseenter`/`mouseleave` don't bubble, and the hover hook binds them to
    // the floating element itself - the positioner, not the popup inside it.
    const positioner = document.querySelector(
      '[data-slot="hover-card-positioner"]',
    );
    if (positioner === null)
      throw new Error("expected the positioner to be mounted");
    fireEvent.pointerEnter(positioner, { pointerType: "mouse" });
    fireEvent.mouseEnter(positioner);
    settleOpenDelay();

    expect(cardIsOpen()).toBe(true);
    expect(screen.getByTestId("owner-workspace-refresh")).toBeTruthy();
  });

  it("tears down the window R listener when a press closes the card", () => {
    // `R` is bound at the WINDOW while the card is open, so if the press gate
    // closed the card visually but left `open` true, a stray "r" typed into the
    // composer would still fire a refresh.
    const trigger = renderTooltip(undefined);
    hoverIn(trigger);
    settleOpenDelay();
    expect(cardIsOpen()).toBe(true);

    fireEvent.pointerDown(trigger);
    settleOpenDelay();

    expect(cardIsOpen()).toBe(false);
    refreshSpy.mockClear();
    ownerPrSendRefreshSpy.mockClear();
    fireEvent.keyDown(window, { key: "r" });
    expect(refreshSpy).not.toHaveBeenCalled();
    expect(ownerPrSendRefreshSpy).not.toHaveBeenCalled();
  });

  it("keeps the row's own click handler working", () => {
    // The gate hangs off `useRender`'s prop merge inside
    // `WorktreeOwnerMetadataTooltip`, which COMPOSES with the row's handlers.
    // If it ever replaced them instead, clicking a sidebar row would silently
    // stop opening the chat.
    const onClick = vi.fn();
    const trigger = renderTooltip(onClick);

    fireEvent.click(trigger);

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
