import { cleanup, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HomeStatusRow } from "@traycer/protocol/notifications/home-status-room";
import { HomeStatusSection } from "@/components/home-focus/home-status-section";
import {
  DEFAULT_HOME_STATUS_THRESHOLDS,
  resolveHomeStatusThresholds,
  type HomeStatusThresholds,
} from "@/lib/home-focus/home-status-thresholds";
import { trackSettingChanged } from "@/lib/analytics";
import { __resetAgentActivityStoreForTests } from "@/stores/agent-activity-store";
import { useSettingsStore } from "@/stores/settings/settings-store";

vi.mock("@/lib/analytics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/analytics")>()),
  trackSettingChanged: vi.fn(),
}));

const NOW = Date.now();

function row(overrides: Partial<HomeStatusRow>): HomeStatusRow {
  return {
    key: "row",
    status: "in-progress",
    item: "Item",
    note: "",
    agentId: "agent-1",
    agentName: "Opus impl",
    epicId: "epic-1",
    hostId: "host-1",
    harnessId: null,
    updatedAt: NOW,
    ...overrides,
  };
}

function renderSection(
  rows: ReadonlyArray<HomeStatusRow>,
  thresholds: HomeStatusThresholds,
) {
  const onDismiss = vi.fn();
  const onOpenAgent = vi.fn();
  render(
    // The note's links open through `useOpenLink`, which is a mutation.
    <QueryClientProvider client={new QueryClient()}>
      <HomeStatusSection
        rows={rows}
        now={NOW}
        thresholds={thresholds}
        onDismiss={onDismiss}
        onOpenAgent={onOpenAgent}
      />
    </QueryClientProvider>,
  );
  return { onDismiss, onOpenAgent };
}

function renderBoard(rows: ReadonlyArray<HomeStatusRow>) {
  useSettingsStore.setState({ homeStatusView: "board" });
  return renderSection(rows, DEFAULT_HOME_STATUS_THRESHOLDS);
}

function column(status: HomeStatusRow["status"]): HTMLElement {
  const found = screen
    .getAllByTestId("home-status-column")
    .find((element) => element.dataset["status"] === status);
  if (found === undefined) throw new Error(`no ${status} column`);
  return found;
}

function cardKeys(status: HomeStatusRow["status"]): Array<string | undefined> {
  return within(column(status))
    .queryAllByTestId("home-status-card")
    .map((card) => card.dataset["rowKey"]);
}

function cardAt(cards: HTMLElement[], index: number): HTMLElement {
  const found = cards.at(index);
  if (found === undefined) throw new Error(`no card at ${String(index)}`);
  return found;
}

beforeEach(() => {
  __resetAgentActivityStoreForTests();
  useSettingsStore.setState(useSettingsStore.getInitialState(), true);
  window.localStorage.clear();
  vi.mocked(trackSettingChanged).mockClear();
});

afterEach(() => {
  cleanup();
});

describe("HomeStatusSection view switch", () => {
  it("defaults to the Table view", () => {
    expect(useSettingsStore.getState().homeStatusView).toBe("table");
    renderSection([row({ key: "a" })], DEFAULT_HOME_STATUS_THRESHOLDS);

    expect(screen.getByTestId("home-status-table")).toBeDefined();
    expect(screen.queryByTestId("home-status-kanban")).toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Table" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("switches to the Board, remembers it, and reports the analytics id", async () => {
    const user = userEvent.setup();
    renderSection([row({ key: "a" })], DEFAULT_HOME_STATUS_THRESHOLDS);

    await user.click(screen.getByRole("button", { name: "Board" }));

    expect(screen.getByTestId("home-status-kanban")).toBeDefined();
    expect(screen.queryByTestId("home-status-table")).toBeNull();
    expect(useSettingsStore.getState().homeStatusView).toBe("board");
    expect(
      window.localStorage.getItem("traycer-gui-app:settings") ?? "",
    ).toContain('"homeStatusView":"board"');
    expect(trackSettingChanged).toHaveBeenCalledWith(
      "layout",
      "homeStatusView",
    );
  });

  it("keeps the summary counts above either view", () => {
    renderBoard([
      row({ key: "a", status: "needs-you" }),
      row({ key: "b", status: "done" }),
    ]);
    expect(screen.getByTestId("home-status-summary").textContent).toBe(
      "1 needs you·1 done",
    );
  });
});

describe("HomeStatusSection, Board view", () => {
  it("puts each card in its status column, in the board's order, with counts", () => {
    renderBoard([
      row({ key: "n1", status: "needs-you", item: "Pricing realign" }),
      row({ key: "n2", status: "needs-you", item: "Mobile 1.4" }),
      row({ key: "p1", status: "in-progress", item: "Host restart fix" }),
      row({ key: "d1", status: "done", item: "Port-forward drain" }),
    ]);

    expect(
      screen
        .getAllByTestId("home-status-column")
        .map((element) => element.dataset["status"]),
    ).toEqual(["needs-you", "in-progress", "done"]);
    expect(cardKeys("needs-you")).toEqual(["n1", "n2"]);
    expect(cardKeys("in-progress")).toEqual(["p1"]);
    expect(cardKeys("done")).toEqual(["d1"]);
    expect(
      within(column("needs-you")).getByTestId("home-status-column-count")
        .textContent,
    ).toBe("2");
    expect(
      within(column("needs-you")).getByRole("heading").textContent,
    ).toContain("Needs you");
  });

  it("says Nothing here in an empty column instead of drawing nothing", () => {
    renderBoard([row({ key: "p1", status: "in-progress" })]);

    expect(
      within(column("needs-you")).getByTestId("home-status-column-empty")
        .textContent,
    ).toBe("Nothing here");
    expect(
      within(column("done")).getByTestId("home-status-column-empty")
        .textContent,
    ).toBe("Nothing here");
    expect(
      within(column("in-progress")).queryByTestId("home-status-column-empty"),
    ).toBeNull();
    expect(
      within(column("done")).getByTestId("home-status-column-count")
        .textContent,
    ).toBe("0");
  });

  it("renders a card's item, markdown note with a clickable link, and agent", () => {
    renderBoard([
      row({
        key: "a",
        item: "Host restart fix",
        note: "Fixing threads on [#5938](https://github.com/traycerai/traycer/pull/5938)",
        agentName: "Fable impl",
        harnessId: "codex",
      }),
    ]);
    const card = screen.getByTestId("home-status-card");

    expect(within(card).getByTestId("home-status-item").textContent).toBe(
      "Host restart fix",
    );
    expect(
      within(card).getByRole("link", { name: "#5938" }).getAttribute("href"),
    ).toBe("https://github.com/traycerai/traycer/pull/5938");
    expect(
      within(card).getByTestId("home-status-agent-harness").dataset[
        "harnessId"
      ],
    ).toBe("codex");
    expect(within(card).getByTestId("home-status-age").textContent).toBe("now");
  });

  it("dims a stale card and marks it, on the same thresholds as the table", () => {
    useSettingsStore.setState({ homeStatusView: "board" });
    const ninetyMinutesAgo = NOW - 90 * 60 * 1000;
    renderSection(
      [
        row({ key: "old", status: "in-progress", updatedAt: ninetyMinutesAgo }),
        row({ key: "new", status: "in-progress" }),
      ],
      resolveHomeStatusThresholds("1h", "never", "24h"),
    );
    const cards = within(column("in-progress")).getAllByTestId(
      "home-status-card",
    );
    expect(cards.map((card) => card.dataset["rowKey"])).toEqual(["old", "new"]);
    const stale = cardAt(cards, 0);
    const fresh = cardAt(cards, 1);

    expect(stale.dataset["stale"]).toBe("true");
    expect(stale.classList.contains("opacity-60")).toBe(true);
    expect(within(stale).getByTestId("home-status-stale").textContent).toBe(
      "stale",
    );
    expect(fresh.dataset["stale"]).toBeUndefined();
    expect(within(fresh).queryByTestId("home-status-stale")).toBeNull();
  });

  it("opens the writing agent's chat from a card", async () => {
    const user = userEvent.setup();
    const { onOpenAgent } = renderBoard([
      row({
        key: "a",
        epicId: "epic-9",
        agentId: "agent-9",
        hostId: "host-remote",
        agentName: "Fable impl",
      }),
    ]);

    await user.click(screen.getByRole("button", { name: "Fable impl" }));

    expect(onOpenAgent).toHaveBeenCalledWith(
      "epic-9",
      "agent-9",
      "host-remote",
    );
  });

  it("dismisses a card by its row key", async () => {
    const user = userEvent.setup();
    const { onDismiss } = renderBoard([
      row({ key: "a", item: "Pricing realign", status: "needs-you" }),
    ]);

    await user.click(
      screen.getByRole("button", { name: "Dismiss Pricing realign" }),
    );

    expect(onDismiss).toHaveBeenCalledWith("a");
  });
});
