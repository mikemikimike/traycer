import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  AppFrameComposerStack,
  AppFrameSideStrip,
  AppFrameStatusBarRow,
  AppFrameTopBar,
} from "@/components/layout-editor/inspector/app-frame-chrome";
import {
  DEFAULT_ARRANGEMENT,
  type LayoutArrangement,
} from "@/lib/layout/layout-arrangement";
import { PRESET_VALUES } from "@/lib/layout/layout-presets";
import type { LayoutValues } from "@/lib/layout/layout-values";

/** The shipped values, with one dock member folded down to a pill. */
const MIXED_DOCK: LayoutValues = {
  ...PRESET_VALUES.default,
  background: { shown: "shown", size: "chip" },
};

afterEach(cleanup);

/**
 * The app's frame around the regions, which BOTH pictures of the app compose:
 * the preset miniature (a whole scaled window) and the Settings page's two
 * bands (one surface at 1:1).
 *
 * These cases used to live in `surface-specimen.test.tsx`. That component is
 * deleted - three of its five branches went with the plinths (L-120) - but
 * what it was really pinning is the chrome, which is shared, so the claims
 * moved here rather than being dropped.
 */
describe("the composer stack (L-97, L-99)", () => {
  it("draws its full-size rows as ONE joined frame (R1-01)", () => {
    render(
      <AppFrameComposerStack
        values={MIXED_DOCK}
        arrangement={DEFAULT_ARRANGEMENT}
      />,
    );

    const dock = screen.getByTestId("app-frame-dock");
    const frames = dock.querySelectorAll('[data-layout-depiction="dock"]');
    expect(frames).toHaveLength(1);
    // Every full-size member is inside that one frame - they used to be a
    // bordered rounded-top box each, inside a further one. Counted off the
    // arrangement rather than written out, so a dock member joining or
    // leaving (L-142 added two) moves this claim with it.
    const fullSizeMembers = DEFAULT_ARRANGEMENT.dock.filter(
      (regionId) => MIXED_DOCK[regionId].size === "full",
    );
    expect(fullSizeMembers.length).toBeGreaterThan(1);
    expect(frames[0]?.childElementCount).toBe(fullSizeMembers.length);
  });

  it("keeps the compact pills above the frame, at the composer's left edge", () => {
    render(
      <AppFrameComposerStack
        values={MIXED_DOCK}
        arrangement={DEFAULT_ARRANGEMENT}
      />,
    );

    const dock = screen.getByTestId("app-frame-dock");
    expect(dock.firstElementChild).toBe(
      screen.getByTestId("app-frame-dock-chips"),
    );
    // The frame is the last thing before the composer box, because the tuck
    // under it is what makes the two one surface (L-99).
    expect(dock.lastElementChild?.getAttribute("data-layout-depiction")).toBe(
      "dock",
    );
    expect(dock.nextElementSibling?.getAttribute("data-testid")).toBe(
      "app-frame-composer",
    );
  });
});

/**
 * R2-02: the strip's assembly - which reading leads and where the spacer goes
 * - was written twice, so a change to what the placement fields mean had to be
 * made in two files or the preset card and the Settings band disagreed about
 * the app. L-156 made that placement four fields, two per reading, and both
 * bars now draw their clusters through the same one copy.
 */
describe("the two bars' clusters (R2-02, L-156)", () => {
  /**
   * The row's own shape: which slots hold which picture, and where the spacer
   * that separates the two ends sits. The resource readout is the one that
   * prints `cpu`; read off the DOM rather than off a class, and it is the one
   * thing this component decides.
   */
  function shapeOf(): ReadonlyArray<string> {
    return [...screen.getByTestId("bar").children].map((child) => {
      if (!child.hasAttribute("data-layout-depiction")) return "spacer";
      return child.textContent.includes("cpu") ? "resource" : "usage";
    });
  }

  function renderRow(arrangement: LayoutArrangement): void {
    render(
      <div data-testid="bar">
        <AppFrameStatusBarRow
          values={PRESET_VALUES.default}
          arrangement={arrangement}
        />
      </div>,
    );
  }

  it("puts each reading at the end of the strip it names", () => {
    renderRow(DEFAULT_ARRANGEMENT);
    expect(shapeOf()).toEqual(["usage", "spacer", "resource"]);
    cleanup();

    renderRow({
      ...DEFAULT_ARRANGEMENT,
      usageSide: "right",
      resourceSide: "left",
    });
    expect(shapeOf()).toEqual(["resource", "spacer", "usage"]);
  });

  it("leads with the usage limits where the two share one end", () => {
    renderRow({ ...DEFAULT_ARRANGEMENT, resourceSide: "left" });
    expect(shapeOf()).toEqual(["usage", "resource", "spacer"]);
  });

  it("draws the reading that named the top bar up there instead", () => {
    const arrangement: LayoutArrangement = {
      ...DEFAULT_ARRANGEMENT,
      resourceHost: "header",
    };
    renderRow(arrangement);
    // The strip keeps the usage cluster, which did not move.
    expect(shapeOf()).toEqual(["usage", "spacer"]);
    cleanup();

    render(
      <div data-testid="bar">
        <AppFrameTopBar
          values={PRESET_VALUES.default}
          arrangement={arrangement}
        />
      </div>,
    );
    expect(shapeOf().filter((slot) => slot !== "spacer")).toContain("resource");
  });

  it("draws nothing for a region the surface does not show", () => {
    render(
      <div data-testid="bar">
        <AppFrameStatusBarRow
          values={{
            ...PRESET_VALUES.default,
            resourceMonitor: {
              ...PRESET_VALUES.default.resourceMonitor,
              shown: "hidden",
            },
          }}
          arrangement={DEFAULT_ARRANGEMENT}
        />
      </div>,
    );

    expect(shapeOf()).toEqual(["usage", "spacer"]);
  });
});

/**
 * S-01, S-03, S-06: `top` keeps drawing today's horizontal row untouched; a
 * side strip draws the real strip's shape (ticket 11) - a top block, Home as
 * its own row, the fake tabs as a column, and a foot with the header-hosted
 * readings and the header's own glyphs.
 */
describe("the tab entries and the side strip (S-01, S-03, ticket 11)", () => {
  const INACTIVE_TAB_CLASS =
    "flex h-8 shrink-0 items-center rounded-xl border border-transparent px-3 text-ui-sm text-muted-foreground";
  // `cn()` merges the conflicting border-color and text-color utilities:
  // `border-canvas-border` (same group as `border-transparent`) and
  // `text-foreground` (same group as `text-muted-foreground`) win because
  // they are later (F4).
  const ACTIVE_TAB_CLASS =
    "flex h-8 shrink-0 items-center rounded-xl border px-3 text-ui-sm border-canvas-border bg-background text-foreground";
  const IDENTITY_DOT_CLASS =
    "size-5 shrink-0 rounded-full border border-border bg-foreground/10";

  it("renders the top bar's row glyph for glyph: three fake tasks, the spacer, History, Bell, the identity dot", () => {
    render(
      <div data-testid="row">
        <AppFrameTopBar
          values={PRESET_VALUES.default}
          arrangement={DEFAULT_ARRANGEMENT}
        />
      </div>,
    );

    expect(screen.queryByTestId("app-frame-side-strip")).toBeNull();
    const row = screen.getByTestId("row");
    // Nothing hosts at the header by default, so the row is exactly: the
    // three fake tasks, the spacer, History, Bell, the identity dot.
    const children = [...row.children];
    expect(children).toHaveLength(7);
    const [
      onboarding,
      sampleChat,
      releaseNotes,
      spacer,
      history,
      bell,
      identity,
    ] = children;
    expect(onboarding.tagName).toBe("SPAN");
    expect(onboarding.className).toBe(INACTIVE_TAB_CLASS);
    expect(onboarding.textContent).toBe("Onboarding flow");
    expect(sampleChat.className).toBe(ACTIVE_TAB_CLASS);
    expect(sampleChat.textContent).toBe("Sample chat");
    expect(releaseNotes.className).toBe(INACTIVE_TAB_CLASS);
    expect(releaseNotes.textContent).toBe("Release notes");
    expect(spacer.className).toBe("flex-1");
    expect(history.classList.contains("lucide-history")).toBe(true);
    expect(bell.classList.contains("lucide-bell")).toBe(true);
    expect(identity.className).toBe(IDENTITY_DOT_CLASS);
  });

  it("draws the top row inside the top block: back/forward and collapse only, no New Task (F7)", () => {
    render(
      <AppFrameSideStrip
        values={PRESET_VALUES.default}
        arrangement={DEFAULT_ARRANGEMENT}
        edge="left"
        collapsed={false}
      />,
    );

    const strip = screen.getByTestId("app-frame-side-strip");
    const topBlock = strip.firstElementChild;
    if (topBlock === null) throw new Error("expected a top block");
    // The arrows/collapse row is the top block's own first row; the Inbox,
    // All tasks, Home and New Task rows follow it inside the same block.
    const topRow = topBlock.firstElementChild;
    if (topRow === null) throw new Error("expected the top row");
    const glyphs = [...topRow.children].map((child) =>
      [...child.classList].find((cls) => cls.startsWith("lucide-")),
    );
    // Back, forward, a spacer (no glyph class), the collapse toggle - New
    // Task moved out of the first row and down after Home (F7).
    expect(glyphs).toEqual([
      "lucide-arrow-left",
      "lucide-arrow-right",
      undefined,
      "lucide-panel-left-close",
    ]);
  });

  it("draws Home as its own nav row inside the top block, gated on the region", () => {
    render(
      <AppFrameSideStrip
        values={PRESET_VALUES.default}
        arrangement={DEFAULT_ARRANGEMENT}
        edge="left"
        collapsed={false}
      />,
    );

    // Hidden by default (PRESET_VALUES.default.homeTab.shown === "hidden").
    expect(screen.queryByText("Home")).toBeNull();

    cleanup();
    render(
      <AppFrameSideStrip
        values={{
          ...PRESET_VALUES.default,
          homeTab: { shown: "shown" },
        }}
        arrangement={DEFAULT_ARRANGEMENT}
        edge="left"
        collapsed={false}
      />,
    );

    const strip = screen.getByTestId("app-frame-side-strip");
    const topBlock = strip.firstElementChild;
    if (!(topBlock instanceof HTMLElement)) {
      throw new Error("expected a top block");
    }
    const taskList = topBlock.nextElementSibling;
    if (!(taskList instanceof HTMLElement)) {
      throw new Error("expected the task row list");
    }
    const home = within(topBlock).getByText("Home");
    const newTask = within(topBlock).getByText("New Task");
    const tasksLabel = within(topBlock).getByText("Tasks");
    // Home sits directly above the primary New Task row (F7), which sits
    // directly above the "Tasks" label, all inside the top block - neither is
    // ever a member of the task row list below it.
    expect(home.parentElement?.nextElementSibling).toBe(newTask.parentElement);
    expect(newTask.parentElement?.nextElementSibling).toBe(
      tasksLabel.parentElement,
    );
    expect(within(taskList).queryByText("Home")).toBeNull();
    expect(within(taskList).queryByText("New Task")).toBeNull();
  });

  it("sizes the fake tab rows from the tokens: a leading slot, then the title", () => {
    render(
      <AppFrameSideStrip
        values={PRESET_VALUES.default}
        arrangement={DEFAULT_ARRANGEMENT}
        edge="left"
        collapsed={false}
      />,
    );

    const strip = screen.getByTestId("app-frame-side-strip");
    const sampleChat = within(strip).getByText("Sample chat");
    const row = sampleChat.parentElement;
    if (row === null) throw new Error("expected the row");
    const leading = row.children[0];
    expect(leading.className).toContain("size-4");
    expect(sampleChat.className).toContain("text-[0.8125rem]");
    // Sample chat carries more than one live agent (turn 1 + background 2),
    // so its row also draws the meter after the title.
    expect(row.children).toHaveLength(3);
  });

  it("lays the foot out with the header-hosted clusters over the account row, and no History/Bell", () => {
    render(
      <AppFrameSideStrip
        values={PRESET_VALUES.default}
        arrangement={DEFAULT_ARRANGEMENT}
        edge="left"
        collapsed={false}
      />,
    );

    const foot = screen.getByTestId("app-frame-side-strip-foot");
    expect(foot.querySelector("svg.lucide-history")).toBeNull();
    expect(foot.querySelector("svg.lucide-bell")).toBeNull();
    expect(within(foot).getByText("Ada Lovelace")).not.toBeNull();
    expect(within(foot).getByText("This Mac · 2 running")).not.toBeNull();
  });

  it("puts a header-hosted reading in the foot, and nowhere else", () => {
    render(
      <AppFrameSideStrip
        values={PRESET_VALUES.default}
        arrangement={{ ...DEFAULT_ARRANGEMENT, resourceHost: "header" }}
        edge="left"
        collapsed={false}
      />,
    );

    const foot = screen.getByTestId("app-frame-side-strip-foot");
    expect(foot.textContent).toContain("cpu");
    const strip = screen.getByTestId("app-frame-side-strip");
    const topBlock = strip.firstElementChild;
    expect(topBlock?.textContent.includes("cpu")).toBe(false);
  });

  it("collapsed: draws one tile per task with a monogram chip, and no row titles", () => {
    render(
      <AppFrameSideStrip
        values={PRESET_VALUES.default}
        arrangement={DEFAULT_ARRANGEMENT}
        edge="left"
        collapsed
      />,
    );

    const strip = screen.getByTestId("app-frame-side-strip");
    expect(strip.dataset.collapsed).toBe("true");
    // No row titles: the task labels never render as text collapsed.
    expect(within(strip).queryByText("Onboarding flow")).toBeNull();
    expect(within(strip).queryByText("Sample chat")).toBeNull();
    expect(within(strip).queryByText("Release notes")).toBeNull();
    // One monogram-chip tile per task, in task order.
    const chips = within(strip).getAllByTestId("side-tab-monogram-chip");
    expect(chips.map((chip) => chip.textContent)).toEqual(["OF", "SC", "RN"]);
  });

  it.each(["left", "right"] as const)(
    "marks the active row joined exactly when the strip edge (%s) matches the sidebar side",
    (edge) => {
      render(
        <AppFrameSideStrip
          values={PRESET_VALUES.default}
          arrangement={{
            ...DEFAULT_ARRANGEMENT,
            tabStripPlacement: edge,
            sidebarSide: edge,
          }}
          edge={edge}
          collapsed={false}
        />,
      );
      const strip = screen.getByTestId("app-frame-side-strip");
      const activeRow = within(strip).getByText("Sample chat").parentElement;
      expect(activeRow?.getAttribute("data-side-tab-joined")).toBe(edge);
      cleanup();

      const otherEdge = edge === "left" ? "right" : "left";
      render(
        <AppFrameSideStrip
          values={PRESET_VALUES.default}
          arrangement={{
            ...DEFAULT_ARRANGEMENT,
            tabStripPlacement: edge,
            sidebarSide: otherEdge,
          }}
          edge={edge}
          collapsed={false}
        />,
      );
      const strip2 = screen.getByTestId("app-frame-side-strip");
      const activeRow2 = within(strip2).getByText("Sample chat").parentElement;
      expect(activeRow2?.hasAttribute("data-side-tab-joined")).toBe(false);
    },
  );

  it("collapsed: marks the active tile joined exactly when the strip edge matches the sidebar side", () => {
    render(
      <AppFrameSideStrip
        values={PRESET_VALUES.default}
        arrangement={{
          ...DEFAULT_ARRANGEMENT,
          tabStripPlacement: "left",
          sidebarSide: "left",
        }}
        edge="left"
        collapsed
      />,
    );
    const strip = screen.getByTestId("app-frame-side-strip");
    const activeChip = within(strip).getAllByTestId(
      "side-tab-monogram-chip",
    )[1];
    const activeTile = activeChip.parentElement;
    expect(activeTile?.getAttribute("data-side-tab-joined")).toBe("left");
  });

  it("draws the Activity list only for an expanded strip in the Activity view", () => {
    const base = { ...DEFAULT_ARRANGEMENT, tabStripPlacement: "left" as const };

    render(
      <AppFrameSideStrip
        values={PRESET_VALUES.default}
        arrangement={{ ...base, sideStripView: "layered" }}
        edge="left"
        collapsed={false}
      />,
    );
    expect(screen.queryByTestId("app-frame-live-agents")).toBeNull();
    cleanup();

    render(
      <AppFrameSideStrip
        values={PRESET_VALUES.default}
        arrangement={{ ...base, sideStripView: "activity" }}
        edge="left"
        collapsed
      />,
    );
    expect(screen.queryByTestId("app-frame-live-agents")).toBeNull();
    cleanup();

    render(
      <AppFrameSideStrip
        values={PRESET_VALUES.default}
        arrangement={{ ...base, sideStripView: "activity" }}
        edge="left"
        collapsed={false}
      />,
    );
    expect(screen.getByTestId("app-frame-live-agents")).not.toBeNull();
  });

  // Finding 5: the depiction's live-agent rows are the SAME
  // `LiveAgentRowView` the real Activity list draws, through the shared
  // `AppFrameLiveAgentItems`, so this picture cannot show anatomy (indent,
  // waiting chip vs. idle time) the real list does not.
  it("draws the sample rows with the real row anatomy: nested indent, a waiting chip, and idle time", () => {
    const base = { ...DEFAULT_ARRANGEMENT, tabStripPlacement: "left" as const };
    render(
      <AppFrameSideStrip
        values={PRESET_VALUES.default}
        arrangement={{ ...base, sideStripView: "activity" }}
        edge="left"
        collapsed={false}
      />,
    );

    const list = screen.getByTestId("app-frame-live-agents");
    const plan = within(list).getByText("Plan the migration").closest("button");
    const tests = within(list).getByText("Write the tests").closest("button");
    const index = within(list).getByText("Rebuild the index").closest("button");
    if (plan === null || tests === null || index === null) {
      throw new Error("expected all three sample rows to render as buttons");
    }

    // "Write the tests" is the one nested (depth 1) row; the other two sit
    // at the base depth (0).
    const depth0 = Number.parseInt(plan.style.paddingInlineStart, 10);
    const depth1 = Number.parseInt(tests.style.paddingInlineStart, 10);
    expect(Number.parseInt(index.style.paddingInlineStart, 10)).toBe(depth0);
    expect(depth1 - depth0).toBe(16); // INDENT_PX

    // The waiting (interview) row shows its chip, not the time; the two
    // background rows show the time, not a chip.
    expect(
      within(plan).getByTestId("strip-live-agent-waiting-chip").textContent,
    ).toBe("Reply");
    expect(within(plan).queryByTestId("chat-row-idle-time")).toBeNull();
    for (const row of [tests, index]) {
      expect(
        within(row).queryByTestId("strip-live-agent-waiting-chip"),
      ).toBeNull();
      expect(within(row).getByTestId("chat-row-idle-time")).toBeTruthy();
    }
  });
});
