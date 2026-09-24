import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useNavigate } from "@tanstack/react-router";
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
import { writeArrangement } from "@/lib/layout/arrangement-gestures";
import {
  SURFACE_GROUPS,
  type SurfaceGroupId,
} from "@/components/layout-editor/regions/region-grammar";
import { LAYOUT_REGIONS } from "@/components/layout-editor/regions/layout-regions";
import { SettingsGroup } from "@/components/settings/settings-group";
import { SettingsPanelShell } from "@/components/settings/settings-panel-shell";
import { SettingsRow } from "@/components/settings/settings-row";
import {
  PANEL_PANE_SELECTOR,
  scrollPaneToCenter,
} from "@/components/settings/use-settings-anchor-reveal";
import { LAYOUT } from "@/components/settings/panels/layout-settings.definitions";
import { TaskTabLayoutRow } from "@/components/settings/panels/layout/tabs-layout-group";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
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
import { cn } from "@/lib/utils";
import { useSettingsSearchStore } from "@/stores/settings/settings-search-store";
import {
  useLayoutSnapshot,
  useLayoutStore,
} from "@/stores/layout/layout-store";
import { useSettingsDensity } from "@/providers/settings-density-context";

/**
 * The full-width host for the layout form (L-03), one setting group at a time
 * (G6).
 *
 * Not a second form: every list, control and write below belongs to
 * `components/layout-editor/inspector/`, and the inspector draws the same ones.
 * What differs is COMPOSITION. The dock filters by selection; this page shows
 * one group per tab - Presets, then one tab per SURFACE - behind a tab bar
 * pinned to the top of the pane, the provider settings' pattern. Inside a
 * surface's tab the region is a ROW, and each order group the surface owns is
 * one list (L-92, L-95).
 *
 * It replaced a column of six cards and a sticky finder between them: with one
 * group on screen the finder had nothing left to narrow, and a filter that hid
 * rows in tabs the reader cannot see would be the opposite of the tab bar's
 * promise. Settings search still lands on every row here, and switches to its
 * tab first (`useLayoutAnchorTab`, `useLayoutRegionLanding`).
 */
export function LayoutSettingsPanel(): ReactNode {
  const compact = useSettingsDensity() === "compact";
  const snapshot = useLayoutSnapshot();
  const [tab, setTab] = useState<LayoutTabId>("presets");
  const [openRows, setOpenRows] = useState<ReadonlyArray<string>>([]);
  const paneRef = useRef<HTMLDivElement | null>(null);
  const bandRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const tabsRef = useRef<HTMLDivElement | null>(null);
  useStickyScrollEdge(sentinelRef, bandRef);

  const toggleRow = useCallback((rowId: string): void => {
    setOpenRows((current) =>
      current.includes(rowId)
        ? current.filter((entry) => entry !== rowId)
        : [...current, rowId],
    );
  }, []);

  useLayoutAnchorTab(setTab);
  useLayoutRegionLanding({ paneRef, tab, setTab, openRows, setOpenRows });

  const gap = compact ? "gap-3.5" : "gap-5";

  return (
    <SettingsPanelShell
      title="Layout"
      description={LAYOUT.page.description}
      bodyClassName="overflow-visible rounded-none border-none bg-transparent"
    >
      {/* Every row below reads its density and its "where does a deeper level
        open" from here, once, rather than from a prop threaded through each
        list (P-4, L-89). */}
      <LayoutFormHostContext value="page">
        <div ref={paneRef} className={cn("flex flex-col", gap)}>
          <SettingsGroup
            group={LAYOUT.definitions.customize}
            showTitle={false}
            tone="default"
            dataTestId="layout-customize-group"
            fill={false}
          >
            <CustomizeLayoutRow />
          </SettingsGroup>
          <Tabs
            ref={tabsRef}
            value={tab}
            onValueChange={(value) => {
              const next = LAYOUT_TABS.find((entry) => entry.id === value);
              if (next === undefined) return;
              // A new tab starts at its top, as a provider's does: if the bar
              // is pinned, bring the pane back to where the tab's body begins.
              revealTabTop(tabsRef.current);
              setTab(next.id);
            }}
            className="gap-0"
          >
            {/* Sticky to the top of the settings pane, in the pane's own
              colour (L-154): a band of it is invisible at rest, and its scroll
              edge lights only while rows are running under it. */}
            <div
              ref={bandRef}
              data-testid="layout-tab-band"
              className="sticky top-0 z-20 bg-background after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-3 after:bg-linear-to-b after:from-background after:to-background/0 after:opacity-0 after:transition-opacity after:duration-150 after:ease-out data-stuck:after:opacity-100"
            >
              {/* The pin detector: a CHILD of the band, absolutely placed on
                its top edge, so it takes no slot in the column (L-154). */}
              <div
                ref={sentinelRef}
                aria-hidden
                className="pointer-events-none absolute inset-x-0 bottom-full h-px"
              />
              <TabsList
                variant="line"
                aria-label="Layout settings"
                className="h-auto w-full max-w-full shrink-0 flex-wrap justify-start"
              >
                {LAYOUT_TABS.map((entry) => (
                  <TabsTrigger
                    key={entry.id}
                    value={entry.id}
                    className="flex-none"
                  >
                    {entry.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
            {/* Every tab stays mounted, hidden while inactive (`forceMount`
              makes Radix drop its own `hidden`, so it is passed here). Radix mounts an
              active tab's children a commit AFTER the tab changes (Presence
              flips in a layout effect), so a region landing or a search
              reveal that switches tab would look for its row in an empty
              panel and have nothing to re-run it. Mounted, the row exists in
              the same commit that shows it - as it did on the one long page. */}
            <TabsContent
              value="presets"
              forceMount
              hidden={tab !== "presets"}
              className={cn("mt-0 flex flex-col pt-4", gap)}
            >
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
            </TabsContent>
            {SURFACE_GROUPS.map((group) => (
              <TabsContent
                key={group.id}
                value={group.id}
                forceMount
                hidden={tab !== group.id}
                className="mt-0 pt-4"
              >
                <SettingsGroup
                  group={LAYOUT.definitions[group.id]}
                  showTitle={false}
                  tone="default"
                  dataTestId={`layout-surface-${group.id}`}
                  fill={false}
                >
                  <SurfaceSection
                    surface={group.id}
                    snapshot={snapshot}
                    filter=""
                    openRows={openRows}
                    onToggleRow={toggleRow}
                    surfaceRows={surfaceRowsFor(group.id)}
                  />
                </SettingsGroup>
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </LayoutFormHostContext>
    </SettingsPanelShell>
  );
}

type LayoutTabId = "presets" | SurfaceGroupId;

/** Presets first - the coarsest control here - then the surfaces in reading order. */
const LAYOUT_TABS: ReadonlyArray<{
  readonly id: LayoutTabId;
  readonly label: string;
}> = [
  { id: "presets", label: LAYOUT.definitions.presets.label },
  ...SURFACE_GROUPS,
];

/** Which tab holds each settings-definition group; anything else is above the bar. */
const TAB_FOR_GROUP: Readonly<Record<string, LayoutTabId>> = {
  presets: "presets",
  resetEverything: "presets",
  ...Object.fromEntries(SURFACE_GROUPS.map((group) => [group.id, group.id])),
};

/**
 * The tab a settings-search anchor lives in, or `null` for one that is not
 * behind the tab bar (the Customize card) or not this page's.
 */
function layoutTabForAnchor(anchor: string): LayoutTabId | null {
  const definition = Object.values(LAYOUT.definitions).find(
    (entry) => entry.anchor === anchor,
  );
  if (definition === undefined) return null;
  const groupKey =
    definition.kind === "row" ? definition.group : definition.key;
  return groupKey === null ? null : (TAB_FOR_GROUP[groupKey] ?? null);
}

/**
 * A Settings search result for a row on this page, taken to its tab.
 *
 * The reveal watcher (`useSettingsAnchorReveal`) finds the anchor and flashes
 * it, and polls until it can - but only the active tab's body is mounted, so
 * the row does not exist until this has switched to it.
 */
function useLayoutAnchorTab(setTab: (tab: LayoutTabId) => void): void {
  const pendingReveal = useSettingsSearchStore((state) => state.pendingReveal);
  useEffect(() => {
    if (pendingReveal === null || pendingReveal.section !== "layout") return;
    if (pendingReveal.anchor === null) return;
    const target = layoutTabForAnchor(pendingReveal.anchor);
    if (target !== null) setTab(target);
  }, [pendingReveal, setTab]);
}

/**
 * Scrolls the pane back to where the tab bar sits unpinned, so the next tab's
 * body begins right under it. Measured on the tabs' own box, which stays in
 * the flow: anything inside the sticky bar moves with the bar and reads "at
 * the top" however far the pane has scrolled (G6 review A).
 */
function revealTabTop(tabs: HTMLDivElement | null): void {
  const pane = tabs?.closest(PANEL_PANE_SELECTOR);
  if (tabs === null || pane === null || pane === undefined) return;
  const delta =
    tabs.getBoundingClientRect().top - pane.getBoundingClientRect().top;
  if (delta < 0) pane.scrollTop += delta;
}

/** A surface tab's own rows, which belong to no region (D7, L-51). */
function surfaceRowsFor(surface: SurfaceGroupId): ReactNode | null {
  if (surface === "statusBar") return <StatusBarSurfaceRows />;
  if (surface === "topBar") return <TabsSurfaceRows />;
  if (surface === "sidebar") return <SidebarSurfaceRows />;
  return null;
}

/**
 * Lights the tab band's scroll edge only while page content is actually
 * running underneath it (L-154).
 *
 * A band painted in the page's own colour is invisible at rest, which is what
 * makes it stop reading as a stripe - and also why it has to say something the
 * moment it starts covering rows. A border or a shadow would say it always;
 * the fade says it exactly when it is true.
 *
 * Pinning is observed, not calculated. The band is pinned exactly when the
 * hairline welded to its top edge has left the pane, so one
 * `IntersectionObserver` rooted on the pane answers it - and answers it on
 * REFLOW as well as on scroll, which a scroll listener cannot. That case is
 * real here: the settings modal is sized off the window, so resizing the app
 * resizes the pane and rewraps the column above the band without moving
 * `scrollTop` at all. A listener would leave a lit fade hanging under an
 * unpinned field, or a pinned field bare, until the next wheel tick.
 *
 * It also reads no boxes, which is the second thing that used to be fragile
 * here: a hand-rolled comparison had to pick between the pane's border box and
 * the padding box that `sticky` actually pins to, and picking wrong meant an
 * edge that never lit at all with nothing red to say so. A pane inset can now
 * only move the crossover by that inset; it cannot invert the answer.
 *
 * The answer is written straight onto the node rather than through state,
 * because re-rendering a five-card page to set one attribute is a price an
 * edge treatment does not get to charge.
 */
function useStickyScrollEdge(
  sentinel: { current: HTMLDivElement | null },
  band: { current: HTMLDivElement | null },
): void {
  useEffect(() => {
    const mark = sentinel.current;
    const node = band.current;
    if (mark === null || node === null) return;
    const pane = node.closest(PANEL_PANE_SELECTOR);
    if (pane === null) return;
    const observer = new IntersectionObserver(
      (entries) => {
        // The newest record wins: a batch can carry several frames of a fast
        // scroll, and only the last one describes where the band is now.
        const latest = entries.at(-1);
        if (latest === undefined) return;
        node.toggleAttribute("data-stuck", !latest.isIntersecting);
      },
      { root: pane },
    );
    // The first delivery is the mount-time answer, so a panel that mounts into
    // an already-scrolled pane - a search landing, or a promotion from the
    // modal into a tab - arrives with its edge lit. The browser delivers it a
    // frame after `observe`, so an already-pinned band paints one bare frame
    // and then fades the edge in over 150ms, which reads as the transition
    // doing its job rather than as a miss.
    observer.observe(mark);
    return () => {
      observer.disconnect();
    };
  }, [sentinel, band]);
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
 * Settings.
 *
 * It lives HERE rather than on Appearance because this page is the editor's own
 * other half: the same components, drawn full width, and the place the door
 * itself lands when the window is too narrow for a canvas (L-03, L-64).
 * Below that threshold the button is withheld rather than disabled - pressing
 * it would navigate to the page the user is already reading - and the row stays,
 * because it is still the thing these settings are, and it is the guide's final
 * coachmark target (L-50).
 *
 * The button says what pressing it DOES. The card used to say "Customize
 * layout" three times over - as the group, as the row and as the button - so
 * the one word that had room to be useful was spent repeating the two above it
 * (P-1).
 */
function CustomizeLayoutRow(): ReactNode {
  const navigate = useNavigate();
  const fits = useLayoutEditorFitsWindow();
  return (
    <SettingsRow
      row={LAYOUT.definitions.customizeEntry}
      control={
        fits ? (
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
          <p className="text-ui-sm text-muted-foreground">
            Needs a wider window
          </p>
        )
      }
    />
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
 * writes can be what puts the row on the page - switching to its surface's
 * tab (G6), and opening the row's own disclosure - and both of them re-render,
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
  readonly tab: LayoutTabId;
  readonly setTab: (tab: LayoutTabId) => void;
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
