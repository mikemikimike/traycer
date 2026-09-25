import { LayoutUsageProvider } from "@/components/layout-editor/inspector/provider-limit-windows";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  LayoutTemplate,
  MessageSquare,
  PanelBottom,
  PanelLeft,
  PanelTop,
  SquarePen,
  type LucideIcon,
} from "lucide-react";
import { Tabs as TabsPrimitive } from "radix-ui";
import { focusSortableRowGrab } from "@/components/layout-editor/inspector/first-row-focus";
import { LayoutFormHostContext } from "@/components/layout-editor/inspector/layout-form-host";
import {
  PresetsBlock,
  ResetEverythingButton,
} from "@/components/layout-editor/inspector/presets-block";
import {
  SidebarSideRow,
  SideStripViewRow,
  TabStripPositionRow,
} from "@/components/layout-editor/inspector/rows/surface-placement-rows";
import { SurfaceSection } from "@/components/layout-editor/inspector/surface-section";
import { layoutRegionRowSelector } from "@/components/layout-editor/layout-search.definitions";
import {
  SURFACE_GROUPS,
  type SurfaceGroupId,
} from "@/components/layout-editor/regions/region-grammar";
import {
  resetSurface,
  surfaceChanged,
} from "@/components/layout-editor/regions/surface-diff";
import { LAYOUT_REGIONS } from "@/components/layout-editor/regions/layout-regions";
import { writeArrangement } from "@/lib/layout/arrangement-gestures";
import { SettingsGroup } from "@/components/settings/settings-group";
import {
  SettingsDetailHeader,
  SettingsMasterDetail,
  SettingsMasterSelect,
} from "@/components/settings/settings-master-detail";
import { settingsRailRowClassName } from "@/components/settings/settings-rail-row";
import { SettingsPanelShell } from "@/components/settings/settings-panel-shell";
import { SettingsRow } from "@/components/settings/settings-row";
import { scrollPaneToCenter } from "@/components/settings/use-settings-anchor-reveal";
import { LAYOUT } from "@/components/settings/panels/layout-settings.definitions";
import { TaskTabLayoutRow } from "@/components/settings/panels/layout/tabs-layout-group";
import { Button } from "@/components/ui/button";
import { ConfirmDestructiveDialog } from "@/components/ui/confirm-destructive-dialog";
import { Switch } from "@/components/ui/switch";
import { useIsMobileViewport } from "@/hooks/ui/use-mobile-viewport";
import { useLayoutEditorFitsWindow } from "@/lib/layout/editor-width";
import { openLayoutEditor } from "@/lib/layout/editor-session";
import { useSettingsAvailabilityContext } from "@/hooks/settings/use-settings-availability-context";
import { mobileFooterChanged } from "@/lib/layout/layout-diff";
import { DEFAULT_ARRANGEMENT } from "@/lib/layout/layout-arrangement";
import type { LayoutSnapshot } from "@/lib/layout/layout-snapshot";
import {
  readPendingLayoutRegion,
  subscribePendingLayoutRegion,
  takePendingLayoutRegion,
} from "@/lib/settings-navigation";
import { useLayoutEditorStore } from "@/stores/layout/layout-editor-store";
import { useSettingsSearchStore } from "@/stores/settings/settings-search-store";
import { useSettingsStore } from "@/stores/settings/settings-store";
import {
  getLayoutSnapshot,
  useLayoutSnapshot,
  useLayoutStore,
} from "@/stores/layout/layout-store";

/**
 * The full-width host for the layout form (L-03): one area at a time, in
 * Settings ▸ Providers' master-detail layout (H2).
 *
 * Not a second form: every list, control and write below belongs to
 * `components/layout-editor/inspector/`, and the inspector draws the same ones.
 * What differs is COMPOSITION. The dock filters by selection; this page lists
 * the areas - Presets, then one per SURFACE - in a rail, and draws the one
 * picked beside it. Inside a surface's area the region is a ROW, and each order
 * group the surface owns is one list (L-92, L-95).
 *
 * The areas are a vertical tab list, so the arrow keys walk them. Every area
 * stays mounted, hidden while another is picked (`forceMount` makes Radix drop
 * its own `hidden`, so it is passed here): Radix mounts a picked area's
 * children a commit AFTER the pick (Presence flips in a layout effect), so a
 * region landing or a search reveal that switches area would look for its row
 * in an empty pane and have nothing to re-run it. Settings search lands on
 * every row here, and picks its area first (`useLayoutAnchorArea`,
 * `useLayoutRegionLanding`).
 */
export function LayoutSettingsPanel(): ReactNode {
  const isMobile = useIsMobileViewport();
  const snapshot = useLayoutSnapshot();
  const taskTabLayout = useSettingsStore((state) => state.taskTabLayout);
  const [area, setArea] = useState<LayoutAreaId>("presets");
  const [openRows, setOpenRows] = useState<ReadonlyArray<string>>([]);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const toggleRow = useCallback((rowId: string): void => {
    setOpenRows((current) =>
      current.includes(rowId)
        ? current.filter((entry) => entry !== rowId)
        : [...current, rowId],
    );
  }, []);

  useLayoutAnchorArea(setArea);
  useLayoutRegionLanding({
    paneRef: rootRef,
    tab: area,
    setTab: setArea,
    openRows,
    setOpenRows,
  });
  useAreaStartsAtTop(rootRef, area);

  const changed = (id: LayoutAreaId): boolean =>
    id === "presets"
      ? snapshot.basePreset !== "default"
      : surfaceChanged(snapshot, id) ||
        (id === "topBar" && taskTabLayout !== DEFAULT_TASK_TAB_LAYOUT);

  return (
    <SettingsPanelShell
      title="Layout"
      // Desktop only, as on Providers: on a phone the description's own width
      // wraps the action onto a row of its own (see the Providers panel).
      description={isMobile ? undefined : LAYOUT.page.description}
      headerAction={<OpenEditorAction />}
      // Desktop only, as on Providers: the card fills the settings pane and the
      // picked area's body owns the scroll. A phone has one scroll container
      // already, so there the card is sized by its contents.
      fillHeight={!isMobile}
    >
      {/* Every row below reads its density and its "where does a deeper level
        open" from here, once, rather than from a prop threaded through each
        list (P-4, L-89). */}
      <LayoutUsageProvider>
        <LayoutFormHostContext value="page">
          <TabsPrimitive.Root
            ref={rootRef}
            value={area}
            onValueChange={(value) => {
              const next = LAYOUT_AREAS.find((entry) => entry.id === value);
              if (next !== undefined) setArea(next.id);
            }}
            orientation="vertical"
            // The setup guide's "Every piece has a row" target: the areas and
            // the picked one together, on a phone as on a desktop.
            data-layout-areas
            className="flex flex-col md:h-full md:min-h-0"
          >
            <SettingsMasterDetail
              railLabel="Layout areas"
              mobileSelect={
                <SettingsMasterSelect
                  label="Layout area"
                  value={area}
                  options={LAYOUT_AREAS.map((entry) => ({
                    value: entry.id,
                    label: entry.label,
                    icon: <entry.icon className="size-4 shrink-0" />,
                    trailing: changed(entry.id) ? <ChangedDot /> : null,
                  }))}
                  onSelect={setArea}
                />
              }
              rail={
                <TabsPrimitive.List
                  aria-label="Layout areas"
                  // Shrinks and scrolls in a short pane, as Providers' list does,
                  // so the last areas are never clipped by the card.
                  className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2"
                >
                  {LAYOUT_AREAS.map((entry) => (
                    <TabsPrimitive.Trigger
                      key={entry.id}
                      value={entry.id}
                      className={settingsRailRowClassName(area === entry.id)}
                    >
                      <entry.icon className="size-4 shrink-0" />
                      <span className="min-w-0 flex-1 truncate">
                        {entry.label}
                      </span>
                      {changed(entry.id) ? <ChangedDot /> : null}
                    </TabsPrimitive.Trigger>
                  ))}
                </TabsPrimitive.List>
              }
            >
              {LAYOUT_AREAS.map((entry) => (
                <TabsPrimitive.Content
                  key={entry.id}
                  value={entry.id}
                  forceMount
                  hidden={area !== entry.id}
                  // Named by its area rather than by the rail's trigger, which a
                  // phone does not draw.
                  aria-labelledby={undefined}
                  aria-label={entry.label}
                  className="flex flex-1 flex-col outline-none md:min-h-0"
                >
                  <div className="border-b border-border/60 pb-4">
                    <SettingsDetailHeader
                      title={entry.label}
                      badge={null}
                      description={entry.description}
                      footer={null}
                      action={
                        // Presets carries its own two resets in its body, "Reset
                        // to <preset>" and "Reset everything"; a third here
                        // would be a choice with no answer.
                        entry.id !== "presets" && changed(entry.id) ? (
                          <ResetAreaButton
                            surface={entry.id}
                            label={entry.label}
                          />
                        ) : null
                      }
                    />
                  </div>
                  {/* From `md` up the scroll owner, so the rail and the area's
                  header stay put: nothing passes UNDER them, so neither needs
                  an opaque fill over the card's translucent surface. */}
                  <div
                    data-layout-area-body
                    className="-mx-5 flex flex-col gap-4 px-5 pt-4 pb-5 md:min-h-0 md:flex-1 md:overflow-y-auto"
                  >
                    <LayoutAreaBody
                      area={entry.id}
                      snapshot={snapshot}
                      openRows={openRows}
                      onToggleRow={toggleRow}
                    />
                  </div>
                </TabsPrimitive.Content>
              ))}
            </SettingsMasterDetail>
          </TabsPrimitive.Root>
        </LayoutFormHostContext>
      </LayoutUsageProvider>
    </SettingsPanelShell>
  );
}

/** One area's rows: the presets and the floor, or one surface's card. */
function LayoutAreaBody(props: {
  readonly area: LayoutAreaId;
  readonly snapshot: LayoutSnapshot;
  readonly openRows: ReadonlyArray<string>;
  readonly onToggleRow: (rowId: string) => void;
}): ReactNode {
  const { area, snapshot } = props;
  if (area === "presets") {
    return (
      <>
        <SettingsGroup
          group={LAYOUT.definitions.presets}
          showTitle={false}
          tone="default"
          dataTestId="layout-presets-group"
          fill={false}
        >
          {/* No canvas here, so a preset hover previews nothing (L-43). */}
          <PresetsBlock onPreviewPreset={noop} />
        </SettingsGroup>
        <ResetEverythingCard snapshot={snapshot} />
      </>
    );
  }
  return (
    <SettingsGroup
      group={LAYOUT.definitions[area]}
      showTitle={false}
      tone="default"
      dataTestId={`layout-surface-${area}`}
      fill={false}
    >
      <SurfaceSection
        surface={area}
        snapshot={snapshot}
        filter=""
        openRows={props.openRows}
        onToggleRow={props.onToggleRow}
        surfaceRows={surfaceRowsFor(area)}
      />
    </SettingsGroup>
  );
}

type LayoutAreaId = "presets" | SurfaceGroupId;

/** Presets first - the coarsest control here - then the surfaces in reading order. */
const LAYOUT_AREAS: ReadonlyArray<{
  readonly id: LayoutAreaId;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly description: string;
}> = [
  {
    id: "presets",
    label: LAYOUT.definitions.presets.label,
    icon: LayoutTemplate,
    description: "How much the app shows at once, in one pick.",
  },
  {
    id: "topBar",
    label: LAYOUT.definitions.topBar.label,
    icon: PanelTop,
    description: "Where task tabs sit, how they fit, and the Home tab.",
  },
  {
    id: "sidebar",
    label: LAYOUT.definitions.sidebar.label,
    icon: PanelLeft,
    description: "Which side the sidebar takes, and the panels on its rail.",
  },
  {
    id: "chat",
    label: LAYOUT.definitions.chat.label,
    icon: MessageSquare,
    description: "What sits beside a conversation as you read it.",
  },
  {
    id: "composer",
    label: LAYOUT.definitions.composer.label,
    icon: SquarePen,
    description: "What sits above the message box, and on its toolbar.",
  },
  {
    id: "statusBar",
    label: LAYOUT.definitions.statusBar.label,
    icon: PanelBottom,
    description: "Usage limits and resources, and which bar draws each.",
  },
];

/** The shipped task tab layout, which a changed Tabs area is measured against. */
const DEFAULT_TASK_TAB_LAYOUT = "scroll";

/** Which area holds each settings-definition group; anything else is on no area. */
const AREA_FOR_GROUP: Readonly<Record<string, LayoutAreaId>> = {
  presets: "presets",
  resetEverything: "presets",
  ...Object.fromEntries(SURFACE_GROUPS.map((group) => [group.id, group.id])),
};

/**
 * The area a settings-search anchor lives in, or `null` for one that is on no
 * area (the header's editor button) or not this page's.
 */
function layoutAreaForAnchor(anchor: string): LayoutAreaId | null {
  const definition = Object.values(LAYOUT.definitions).find(
    (entry) => entry.anchor === anchor,
  );
  if (definition === undefined) return null;
  const groupKey =
    definition.kind === "row" ? definition.group : definition.key;
  return groupKey === null ? null : (AREA_FOR_GROUP[groupKey] ?? null);
}

/**
 * A Settings search result for a row on this page, taken to its area.
 *
 * The reveal watcher (`useSettingsAnchorReveal`) finds the anchor and flashes
 * it, and polls until it can - but only the picked area is visible, so the row
 * cannot be seen until this has picked its area.
 */
function useLayoutAnchorArea(setArea: (area: LayoutAreaId) => void): void {
  const pendingReveal = useSettingsSearchStore((state) => state.pendingReveal);
  useEffect(() => {
    if (pendingReveal === null || pendingReveal.section !== "layout") return;
    if (pendingReveal.anchor === null) return;
    const target = layoutAreaForAnchor(pendingReveal.anchor);
    if (target !== null) setArea(target);
  }, [pendingReveal, setArea]);
}

/**
 * A newly picked area starts at its top, as a newly picked provider does.
 *
 * Each area keeps its own scroll box while hidden, so without this one left
 * scrolled far down would come back there. A layout effect, so it runs before
 * a region landing or a search reveal scrolls the same box to a row.
 */
function useAreaStartsAtTop(
  root: { current: HTMLDivElement | null },
  area: LayoutAreaId,
): void {
  useLayoutEffect(() => {
    const body = root.current?.querySelector(
      '[role="tabpanel"]:not([hidden]) [data-layout-area-body]',
    );
    if (body !== null && body !== undefined) body.scrollTop = 0;
  }, [root, area]);
}

/** The same dot a changed region row draws, said in words for a screen reader. */
function ChangedDot(): ReactNode {
  return (
    <>
      <span
        aria-hidden
        data-testid="area-changed-dot"
        className="size-1.5 shrink-0 rounded-full bg-info"
      />
      <span className="sr-only">, changed</span>
    </>
  );
}

/**
 * One area back to what shipped, confirmed first: like "Reset everything",
 * this host has no Undo (L-108).
 */
function ResetAreaButton(props: {
  readonly surface: SurfaceGroupId;
  readonly label: string;
}): ReactNode {
  const { surface, label } = props;
  const [confirming, setConfirming] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  // Set on confirm: the reset clears the area's changed flag, which unmounts
  // this button - the dialog's opener - so its focus return has nowhere to go.
  // The area's panel stays mounted and takes it instead. Cancel leaves it
  // `null` and the opener, still there, gets focus back as usual.
  const resetPanelRef = useRef<HTMLElement | null>(null);
  return (
    <>
      <Button
        ref={buttonRef}
        type="button"
        variant="ghost"
        size="sm"
        aria-label={`Reset ${label}`}
        onClick={() => {
          setConfirming(true);
        }}
      >
        Reset
      </Button>
      <ConfirmDestructiveDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Reset ${label}?`}
        description={`Every ${label} setting, and where each of its pieces sits, goes back to how the app shipped. The rest of the layout is left alone. This cannot be undone here.`}
        cascadeSummary={null}
        actionLabel="Reset"
        isPending={false}
        blockedReason={null}
        onCloseAutoFocus={(event) => {
          const panel = resetPanelRef.current;
          if (panel === null) return;
          resetPanelRef.current = null;
          event.preventDefault();
          panel.focus({ preventScroll: true });
        }}
        onConfirm={() => {
          resetPanelRef.current =
            buttonRef.current?.closest<HTMLElement>('[role="tabpanel"]') ??
            null;
          setConfirming(false);
          if (surface === "topBar") {
            useSettingsStore
              .getState()
              .setTaskTabLayout(DEFAULT_TASK_TAB_LAYOUT);
          }
          useLayoutEditorStore.getState().recordGesture(() => {
            useLayoutStore
              .getState()
              .replaceAll(resetSurface(getLayoutSnapshot(), surface));
          });
        }}
      />
    </>
  );
}

/** A surface area's own rows, which belong to no region (D7, L-51). */
function surfaceRowsFor(surface: SurfaceGroupId): ReactNode | null {
  if (surface === "statusBar") return <StatusBarSurfaceRows />;
  if (surface === "topBar") return <TabsSurfaceRows />;
  if (surface === "sidebar") return <SidebarSurfaceRows />;
  return null;
}

/**
 * The floor, last on the page and the only card with a tone (redesign 4.4,
 * L-20).
 *
 * It renders whether or not anything has changed, with its button disabled on
 * a layout nobody has touched: showing the floor and saying you are standing
 * on it is clearer than a card that vanishes (5.8). The confirm inside the
 * button stays, because this host has no Undo (L-108).
 */
function ResetEverythingCard(props: {
  readonly snapshot: LayoutSnapshot;
}): ReactNode {
  return (
    <SettingsGroup
      group={LAYOUT.definitions.resetEverything}
      showTitle
      tone="danger"
      dataTestId="layout-reset-group"
      fill={false}
    >
      <SettingsRow
        row={LAYOUT.definitions.resetEverythingAction}
        control={<ResetEverythingButton snapshot={props.snapshot} />}
      />
    </SettingsGroup>
  );
}

/**
 * The way from this page into the canvas editor (5.1), and the only entry in
 * Settings: the page header's action, where Providers keeps its refresh (H2).
 *
 * It lives HERE rather than on Appearance because this page is the editor's own
 * other half: the same components, drawn full width, and the place the door
 * itself lands when the window is too narrow for a canvas (L-03, L-64).
 * Below that threshold the button is withheld rather than disabled - pressing
 * it would navigate to the page the user is already reading - and says so in
 * its place, because it is still the guide's final coachmark target (L-50)
 * and the search result "Customize layout" lands on it.
 */
function OpenEditorAction(): ReactNode {
  const navigate = useNavigate();
  const fits = useLayoutEditorFitsWindow();
  return (
    <div data-settings-anchor={LAYOUT.definitions.customizeEntry.anchor}>
      {fits ? (
        <Button
          type="button"
          size="sm"
          onClick={() => {
            openLayoutEditor({
              source: "direct_ui",
              entry: "pointer",
              target: null,
              navigate,
            });
          }}
        >
          Open the editor
        </Button>
      ) : (
        // The button's own height, so the line sits where the button would.
        <p className="flex h-7 items-center text-ui-sm text-muted-foreground">
          The editor needs a wider window
        </p>
      )}
    </div>
  );
}

/**
 * The Tabs card's surface tier: where the strip sits, what a vertical strip
 * shows, then how its tabs fit.
 * Both close with a `SettingsRow` rule, which the Home row under them needs.
 */
function TabsSurfaceRows(): ReactNode {
  return (
    <>
      <TabStripPositionRow />
      <SideStripViewRow />
      <TaskTabLayoutRow />
    </>
  );
}

/**
 * The Sidebar card's surface tier: which side of the task canvas it takes.
 *
 * Wrapped so the row is its container's last child and drops its own rule:
 * the panel list under it already draws one on its top edge.
 */
function SidebarSurfaceRows(): ReactNode {
  return (
    <div>
      <SidebarSideRow />
    </div>
  );
}

/**
 * The named slot for the Status bar's SURFACE tier, holding the one row that
 * belongs to the surface rather than to a region on it.
 *
 * `mobileFooter` decides whether the strip exists at all on a narrow viewport
 * (L-51). Where the two readings live is a per-REGION pick (L-156), so it is
 * drawn on their own rows and not here; the slot stays because the tier does,
 * and the next surface-level row on this card belongs in it.
 */
function StatusBarSurfaceRows(): ReactNode {
  return <MobileFooterRow />;
}

/**
 * Whether the strip is drawn at all on a narrow viewport (L-51).
 *
 * Drawn only by this host, and only in the installed mobile app: every other
 * build draws the footer whenever `usageHost` says so, so the switch would
 * pick between two identical outcomes. It is also one of the three arrangement
 * fields that had no changed indication and no revert anywhere (P-6).
 */
function MobileFooterRow(): ReactNode {
  const availability = useSettingsAvailabilityContext();
  const arrangement = useLayoutStore((state) => state.arrangement);
  if (!LAYOUT.definitions.mobileFooter.availableWhen(availability)) return null;
  const changed = mobileFooterChanged(arrangement);
  return (
    <SettingsRow
      row={LAYOUT.definitions.mobileFooter}
      control={
        <div className="flex items-center gap-1.5">
          <Switch
            checked={arrangement.mobileFooter}
            onCheckedChange={(checked) => {
              writeArrangement({ ...arrangement, mobileFooter: checked });
            }}
            aria-label={LAYOUT.definitions.mobileFooter.label}
          />
          {changed ? <RevertMobileFooter /> : null}
        </div>
      }
    />
  );
}

function RevertMobileFooter(): ReactNode {
  const arrangement = useLayoutStore((state) => state.arrangement);
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-label="Revert the small-screen status bar"
      onClick={() => {
        writeArrangement({
          ...arrangement,
          mobileFooter: DEFAULT_ARRANGEMENT.mobileFooter,
        });
      }}
    >
      Revert
    </Button>
  );
}

/**
 * Landing on a region row (A.5 gap 1).
 *
 * Below the editor's width threshold the door redirects here instead of
 * opening a canvas, and until now it discarded the region the user had asked
 * for: a search result for "Minimap" in a 900px window landed on a page with
 * nothing preselected, nothing scrolled to and nothing highlighted. The door
 * now hands the region over (`navigateToLayoutRegion`), and this is the page
 * taking it: scroll the row into the middle of the pane, open its disclosure,
 * and mark it with the same flash every other settings result leaves.
 *
 * The request OUTLIVES the call that made it, because the panel mounts after
 * the navigation commits - so it is read from the door's own slot rather than
 * passed in, and taking it is what ends it.
 *
 * **The request survives the renders that make the row exist** (5.9). Two
 * writes can be what puts the row on the page - picking its surface's area
 * (H2), and opening the row's own disclosure - and both of them re-render,
 * so the row does not exist until React has committed them.
 * The effect therefore makes those writes and RETURNS, leaving the request in
 * its slot; it runs again in the commit they produce, where the page is in the
 * state the row needs and the DOM is laid out. Nothing is deferred to a timer:
 * re-running on the commit is React's own guarantee, not a guess about when
 * one will happen. Taking the request is what ends it, and it is taken on the
 * pass that could answer it whether or not a row was there to answer with - a
 * landing that fired later, on an unrelated keystroke, would be a scroll
 * nobody asked for.
 */
function useLayoutRegionLanding(input: {
  readonly paneRef: { current: HTMLDivElement | null };
  readonly tab: LayoutAreaId;
  readonly setTab: (tab: LayoutAreaId) => void;
  readonly openRows: ReadonlyArray<string>;
  readonly setOpenRows: (
    update: (current: ReadonlyArray<string>) => string[],
  ) => void;
}): void {
  const { paneRef, tab, setTab, openRows, setOpenRows } = input;
  const pending = useSyncExternalStore(
    subscribePendingLayoutRegion,
    readPendingLayoutRegion,
    readPendingLayoutRegion,
  );

  useEffect(() => {
    if (pending === null) return;
    const regionId = pending.regionId;
    const surface = LAYOUT_REGIONS[regionId].surface;
    const elsewhere = tab !== surface;
    const closed = !openRows.includes(regionId);
    if (elsewhere) setTab(surface);
    if (closed) setOpenRows((current) => [...current, regionId]);
    if (elsewhere || closed) return;
    takePendingLayoutRegion();
    const row = paneRef.current?.querySelector(
      layoutRegionRowSelector(regionId),
    );
    if (row === null || row === undefined) return;
    scrollPaneToCenter(row, null);
    // The scroll is for the eye; the focus is for the hands. A keyboard user
    // used to land with focus wherever navigation had left it, looking at a
    // flash they could not act on.
    focusSortableRowGrab(row);
    row.setAttribute(LANDING_FLASH_ATTRIBUTE, "true");
    window.setTimeout(() => {
      row.removeAttribute(LANDING_FLASH_ATTRIBUTE);
    }, LANDING_FLASH_MS);
  }, [pending, tab, setTab, openRows, paneRef, setOpenRows]);
}

/** The same mark every settings-search result leaves (`settings-search.css`). */
const LANDING_FLASH_ATTRIBUTE = "data-settings-anchor-flash";
const LANDING_FLASH_MS = 1800;

/** No canvas to preview onto, and no index row to walk to. */
function noop(): void {}
