import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, renderHook, screen } from "@testing-library/react";
import {
  SideTabMeter,
  type SideTabLiveAgents,
} from "../side-strip/agent-meter";
import {
  NO_LIVE_AGENTS,
  useSideTabLiveAgents,
} from "../side-strip/side-tab-live-agents";
import { useThemeLibraryStore } from "@/stores/settings/theme-library-store";
import {
  __resetAgentActivityStoreForTests,
  __setAgentActivityStateForTests,
} from "@/stores/agent-activity-store";

afterEach(() => {
  cleanup();
  useThemeLibraryStore.setState({ panelAnimations: true });
  __resetAgentActivityStoreForTests();
});

function agents(turn: number, background: number): SideTabLiveAgents {
  return { turn, background };
}

function meter(): HTMLElement {
  return screen.getByTestId("side-tab-meter");
}

function pipKinds(root: HTMLElement): ReadonlyArray<string | undefined> {
  return Array.from(root.querySelectorAll("[data-pip]")).map(
    (el) => (el as HTMLElement).dataset.pip,
  );
}

describe("SideTabMeter", () => {
  it("draws no pips and no accessible name for an empty task", () => {
    render(
      <SideTabMeter agents={NO_LIVE_AGENTS} attention={null} size="tile" />,
    );
    const root = meter();
    expect(root.querySelectorAll("[data-pip]")).toHaveLength(0);
    expect(root.getAttribute("role")).toBeNull();
    expect(root.getAttribute("aria-label")).toBeNull();
    expect(screen.queryByTestId("side-tab-meter-more")).toBeNull();
  });

  it("draws one breathing pip for a single running agent", () => {
    render(<SideTabMeter agents={agents(1, 0)} attention={null} size="tile" />);
    const root = meter();
    expect(pipKinds(root)).toEqual(["turn"]);
    const pip = root.querySelector("[data-pip]");
    expect(pip?.getAttribute("data-breathing")).toBe("true");
    expect(root.getAttribute("role")).toBe("img");
  });

  it("draws all four pips at exactly the cap, with no +N", () => {
    render(<SideTabMeter agents={agents(4, 0)} attention={null} size="tile" />);
    const root = meter();
    expect(pipKinds(root)).toEqual(["turn", "turn", "turn", "turn"]);
    expect(screen.queryByTestId("side-tab-meter-more")).toBeNull();
  });

  it("caps at four pips and folds the rest into +N", () => {
    render(<SideTabMeter agents={agents(6, 0)} attention={null} size="tile" />);
    const root = meter();
    expect(pipKinds(root)).toEqual(["turn", "turn", "turn", "turn"]);
    expect(screen.getByTestId("side-tab-meter-more").textContent).toBe("+2");
  });

  it("orders turn pips before background pips", () => {
    render(<SideTabMeter agents={agents(2, 2)} attention={null} size="tile" />);
    expect(pipKinds(meter())).toEqual([
      "turn",
      "turn",
      "background",
      "background",
    ]);
  });

  it("places the attention pip after the agent pips and is never itself cut", () => {
    render(
      <SideTabMeter agents={agents(2, 1)} attention="approval" size="tile" />,
    );
    const root = meter();
    expect(pipKinds(root)).toEqual(["turn", "turn", "background", "waiting"]);
    expect(screen.queryByTestId("side-tab-meter-more")).toBeNull();
  });

  it("keeps the attention pip when agents are capped: 6 agents + waiting -> 3 agent pips, waiting, +3", () => {
    render(
      <SideTabMeter agents={agents(6, 0)} attention="approval" size="tile" />,
    );
    const root = meter();
    expect(pipKinds(root)).toEqual(["turn", "turn", "turn", "waiting"]);
    expect(screen.getByTestId("side-tab-meter-more").textContent).toBe("+3");
  });

  it("shows an attention pip alone when there are no live agents", () => {
    render(
      <SideTabMeter agents={NO_LIVE_AGENTS} attention="failed" size="tile" />,
    );
    const root = meter();
    expect(pipKinds(root)).toEqual(["failed"]);
    expect(screen.queryByTestId("side-tab-meter-more")).toBeNull();
  });

  it.each([
    ["approval", "waiting"],
    ["reply", "waiting"],
    ["failed", "failed"],
    ["unread", "unread"],
  ] as const)("maps the %s badge to the %s pip colour", (badge, pip) => {
    render(
      <SideTabMeter agents={NO_LIVE_AGENTS} attention={badge} size="tile" />,
    );
    expect(pipKinds(meter())).toEqual([pip]);
  });

  it("breathes turn pips only while motion is enabled", () => {
    useThemeLibraryStore.getState().setAppearancePreference({
      panelAnimations: false,
    });
    render(<SideTabMeter agents={agents(2, 1)} attention={null} size="tile" />);
    const pips = Array.from(meter().querySelectorAll("[data-pip]"));
    for (const pip of pips) {
      expect((pip as HTMLElement).dataset.breathing).toBeUndefined();
    }
  });

  it("never marks a background or attention pip as breathing", () => {
    render(
      <SideTabMeter agents={agents(1, 1)} attention="failed" size="tile" />,
    );
    const pips = Array.from(meter().querySelectorAll("[data-pip]"));
    const byKind = new Map(
      pips.map((pip) => [
        (pip as HTMLElement).dataset.pip,
        (pip as HTMLElement).dataset.breathing,
      ]),
    );
    expect(byKind.get("turn")).toBe("true");
    expect(byKind.get("background")).toBeUndefined();
    expect(byKind.get("failed")).toBeUndefined();
  });
});

describe("SideTabMeter accessible label", () => {
  it("joins running, background and attention parts", () => {
    render(
      <SideTabMeter agents={agents(2, 1)} attention="approval" size="tile" />,
    );
    expect(meter().getAttribute("aria-label")).toBe(
      "2 running, 1 background, waiting for your approval",
    );
  });

  it("names a reply wait distinctly from an approval wait", () => {
    render(
      <SideTabMeter agents={NO_LIVE_AGENTS} attention="reply" size="tile" />,
    );
    expect(meter().getAttribute("aria-label")).toBe("waiting for your reply");
  });

  it("is empty for an idle, unattended task - no label at all", () => {
    render(
      <SideTabMeter agents={NO_LIVE_AGENTS} attention={null} size="tile" />,
    );
    expect(meter().getAttribute("aria-label")).toBeNull();
  });

  it("omits a zero tier", () => {
    render(<SideTabMeter agents={agents(3, 0)} attention={null} size="tile" />);
    expect(meter().getAttribute("aria-label")).toBe("3 running");
    cleanup();

    render(<SideTabMeter agents={agents(0, 2)} attention={null} size="tile" />);
    expect(meter().getAttribute("aria-label")).toBe("2 background");
  });
});

describe("useSideTabLiveAgents", () => {
  it("splits an epic's working set into turn and background counts", () => {
    __setAgentActivityStateForTests(
      {
        "epic-1": {
          working: ["a", "b", "c"],
          turn: ["a", "b"],
        },
      },
      "local",
      "connected",
    );
    const { result } = renderHook(() => useSideTabLiveAgents("epic-1"));
    expect(result.current).toEqual({ turn: 2, background: 1 });
  });

  it("is NO_LIVE_AGENTS for a null or unknown epic", () => {
    const { result: nullEpic } = renderHook(() => useSideTabLiveAgents(null));
    expect(nullEpic.current).toEqual(NO_LIVE_AGENTS);

    const { result: unknown } = renderHook(() =>
      useSideTabLiveAgents("epic-unknown"),
    );
    expect(unknown.current).toEqual(NO_LIVE_AGENTS);
  });
});
