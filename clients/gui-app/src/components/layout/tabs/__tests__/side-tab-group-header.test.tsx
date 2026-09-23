/**
 * The vertical strip's group header (S-19): the member count it is handed,
 * a click that collapses and expands the group through the tabs store, the
 * shared group editor on right-click, and a collapsed group's worst member
 * badge read from the strip's indicator batch (S-30).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { HostNotificationsEntityRef } from "@traycer/protocol/host/notifications/contracts";
import { ColumnEdgeContext } from "@/components/layout/column-edge-context";
import { NotificationIndicatorsContext } from "@/components/notifications/notification-indicator-context";
import { SideTabGroupHeader } from "@/components/layout/tabs/side-strip/side-tab-group-header";
import type { SideTabRowVariant } from "@/components/layout/tabs/side-strip/side-tab-row";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { EdgeSide } from "@/lib/layout/layout-arrangement";
import type { SurfaceNotificationIndicators } from "@/stores/notifications/notification-indicator-state";
import { __resetAppLocalNotificationsStoreForTests } from "@/stores/notifications/app-local-notifications-store";
import { tabItemId, tabRefKey } from "@/stores/tabs/layout";
import { useTabsStore } from "@/stores/tabs/store";
import type { TabGroup } from "@/stores/tabs/tab-groups";
import type { TabRef } from "@/stores/tabs/types";

// The editor's "New tab in group" navigates; nothing here is about routing.
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return { ...actual, useNavigate: () => vi.fn() };
});

const GROUP_ID = "g";
const QUIET = {
  pendingApproval: false,
  pendingInterview: false,
  unreadFailure: false,
  unreadDone: false,
  pendingFork: false,
};

/** A group with one member tab: the store drops a group that has none. */
function seedGroup(collapsed: boolean): TabGroup {
  const group: TabGroup = { name: "Work", color: "#8ab4f8", collapsed };
  const member: TabRef = { kind: "epic", id: "e-1" };
  useTabsStore.setState({
    version: 2,
    items: [{ kind: "tab", id: tabItemId(member), ref: member }],
    activeItemId: tabItemId(member),
    stripOrder: [member],
    systemTabs: { history: null, settings: null },
    groups: { [GROUP_ID]: group },
    customizations: {
      [tabRefKey(member)]: { color: null, icon: null, groupId: GROUP_ID },
    },
  });
  return group;
}

function renderHeader(input: {
  readonly group: TabGroup;
  readonly variant: SideTabRowVariant;
  readonly memberEntities: ReadonlyArray<HostNotificationsEntityRef>;
  readonly indicators: SurfaceNotificationIndicators;
  /** The nearest vertical column's edge, `null` outside a column (D7). */
  readonly columnSide: EdgeSide | null;
}): void {
  render(
    <ColumnEdgeContext.Provider value={input.columnSide}>
      <TooltipProvider>
        <NotificationIndicatorsContext.Provider value={input.indicators}>
          <SideTabGroupHeader
            groupId={GROUP_ID}
            group={input.group}
            variant={input.variant}
            memberCount={3}
            memberEntities={input.memberEntities}
            onClose={() => undefined}
          />
        </NotificationIndicatorsContext.Provider>
      </TooltipProvider>
    </ColumnEdgeContext.Provider>,
  );
}

/** The Radix Popover Content node that owns the `data-side`/`data-align` Popper wrote. */
function groupEditorPopoverContent(): HTMLElement {
  const content = document.querySelector<HTMLElement>(
    '[data-slot="popover-content"]',
  );
  if (content === null) throw new Error("group editor popover not found");
  return content;
}

function header(): HTMLElement {
  return screen.getByTestId(`side-tab-group-header-${GROUP_ID}`);
}

describe("SideTabGroupHeader", () => {
  beforeEach(() => {
    useTabsStore.setState(useTabsStore.getInitialState(), true);
    __resetAppLocalNotificationsStoreForTests();
  });

  afterEach(() => {
    cleanup();
    useTabsStore.setState(useTabsStore.getInitialState(), true);
  });

  it("shows the name and the member count", () => {
    renderHeader({
      group: seedGroup(false),
      variant: "expanded",
      memberEntities: [],
      indicators: { epics: {}, chats: {} },
      columnSide: null,
    });

    expect(header().textContent).toContain("Work");
    expect(screen.getByTestId("side-tab-group-count").textContent).toBe("3");
  });

  it("toggles the group's collapsed state on click", () => {
    renderHeader({
      group: seedGroup(false),
      variant: "expanded",
      memberEntities: [],
      indicators: { epics: {}, chats: {} },
      columnSide: null,
    });

    fireEvent.click(header());

    expect(useTabsStore.getState().groups?.[GROUP_ID]?.collapsed).toBe(true);
  });

  it("opens the shared group editor on right-click", () => {
    renderHeader({
      group: seedGroup(false),
      variant: "expanded",
      memberEntities: [],
      indicators: { epics: {}, chats: {} },
      columnSide: null,
    });

    fireEvent.contextMenu(header());

    expect(screen.getByRole("textbox", { name: "Group name" })).toBeDefined();
    expect(screen.getByText("Ungroup")).toBeDefined();
  });

  it.each([
    ["left", "right"],
    ["right", "left"],
  ] as const)(
    "opens the group editor popover mirrored off a %s sidebar column (side=%s)",
    (columnSide, expectedSide) => {
      renderHeader({
        group: seedGroup(false),
        variant: "expanded",
        memberEntities: [],
        indicators: { epics: {}, chats: {} },
        columnSide,
      });

      fireEvent.contextMenu(header());

      const content = groupEditorPopoverContent();
      expect(content.getAttribute("data-side")).toBe(expectedSide);
      expect(content.getAttribute("data-align")).toBe("start");
    },
  );

  it("badges a collapsed group with its worst member's notification", () => {
    renderHeader({
      group: seedGroup(true),
      variant: "expanded",
      memberEntities: [{ epicId: "e-1" }, { epicId: "e-2" }, { epicId: "e-3" }],
      indicators: {
        epics: {
          "e-1": { ...QUIET, unreadDone: true },
          "e-2": { ...QUIET, pendingApproval: true },
          "e-3": { ...QUIET, unreadFailure: true },
        },
        chats: {},
      },
      columnSide: null,
    });

    // Waiting outranks a failure and an unread result in the rail (S-17).
    expect(
      screen.getByTestId("side-tab-group-badge").getAttribute("data-kind"),
    ).toBe("waiting");
  });

  it("draws no badge on an expanded group, whatever its members hold", () => {
    renderHeader({
      group: seedGroup(false),
      variant: "expanded",
      memberEntities: [{ epicId: "e-1" }],
      indicators: {
        epics: { "e-1": { ...QUIET, unreadFailure: true } },
        chats: {},
      },
      columnSide: null,
    });

    expect(screen.queryByTestId("side-tab-group-badge")).toBeNull();
  });

  it("is a tile with the name's first letter in the rail", () => {
    renderHeader({
      group: seedGroup(true),
      variant: "collapsed",
      memberEntities: [{ epicId: "e-1" }],
      indicators: {
        epics: { "e-1": { ...QUIET, unreadFailure: true } },
        chats: {},
      },
      columnSide: null,
    });

    expect(header().textContent).toBe("W");
    expect(
      screen.getByTestId("side-tab-group-badge").getAttribute("data-kind"),
    ).toBe("failed");
    expect(screen.queryByTestId("side-tab-group-count")).toBeNull();
  });
});
