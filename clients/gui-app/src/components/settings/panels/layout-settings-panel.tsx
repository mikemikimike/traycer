import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  focusFirstSortableRow,
  focusSortableRowGrab,
} from "@/components/layout-editor/inspector/first-row-focus";
import { RevertButton } from "@/components/layout-editor/inspector/inspector-row";
import { LayoutFormHostContext } from "@/components/layout-editor/inspector/layout-form-host";
import {
  PresetsBlock,
  ResetEverythingButton,
} from "@/components/layout-editor/inspector/presets-block";
import { RegionFilter } from "@/components/layout-editor/inspector/region-filter";
import { UsageHostControl } from "@/components/layout-editor/inspector/region-controls";
import { SurfaceSection } from "@/components/layout-editor/inspector/surface-section";
import { layoutRegionRowSelector } from "@/components/layout-editor/layout-search.definitions";
import { writeArrangement } from "@/components/layout-editor/layout-gestures";
import { SURFACE_GROUPS } from "@/components/layout-editor/regions/region-grammar";
import { surfaceMatchesFilter } from "@/components/layout-editor/regions/surface-groups";
import { SettingsGroup } from "@/components/settings/settings-group";
import { SettingsPanelShell } from "@/components/settings/settings-panel-shell";
import { SettingsRow } from "@/components/settings/settings-row";
import { scrollPaneToCenter } from "@/components/settings/use-settings-anchor-reveal";
import { LAYOUT } from "@/components/settings/panels/layout-settings.definitions";
import { TaskTabLayoutRow } from "@/components/settings/panels/layout/tabs-layout-group";
import { Button } from "@/components/ui/button";
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
import { useLayoutEditorStore } from "@/stores/layout/layout-editor-store";
import {
  useLayoutSnapshot,
  useLayoutStore,
} from "@/stores/layout/layout-store";
import { useSettingsDensity } from "@/providers/settings-density-context";

/**
 * The full-width host for the layout form (L-03), grouped by SURFACE (L-92,
 * L-95).
 *
 * Not a second form: every list, control and write below belongs to
 * `components/layout-editor/inspector/`, and the inspector draws the same ones.
 * What differs is COMPOSITION, which is the only thing that can differ. The
 * dock filters by selection - one region's section, its group's list
 * highlighted on its row. This page cannot, because nothing is selected, so it
 * groups instead: one card per surface, the region as a row inside it, and one
 * list per order group the surface owns.
 *
 * That is what removed the repeats the owner found (L-92). The sidebar's nine
 * identical Position lists are ONE list of nine rows; the composer's eight are
 * three lists; Position is no longer a row anywhere here, because a region's
 * position IS its place in its list; and each region has exactly one Shown
 * control, which killed the eye button that silently turned a pinned "Shown"
 * back into "Auto" (D5).
 *
 * The index still belongs to the dock: an index exists to pick ONE section to
 * open, and here they are all open. What this page takes from it is the filter
 * (I-11), which is the part that still has work to do on a page of five cards.
 */
export function LayoutSettingsPanel(): ReactNode {
  const compact = useSettingsDensity() === "compact";
  const snapshot = useLayoutSnapshot();
  const filter = useLayoutEditorStore((state) => state.filter);
  const [openRows, setOpenRows] = useState<ReadonlyArray<string>>([]);
  const paneRef = useRef<HTMLDivElement | null>(null);

  const toggleRow = useCallback((rowId: string): void => {
    setOpenRows((current) =>
      current.includes(rowId)
        ? current.filter((entry) => entry !== rowId)
        : [...current, rowId],
    );
  }, []);

  // A filter typed here is the editor store's, which is what makes it the same
  // field in both hosts - and what makes it outlive this page. Cleared on the
  // way out so the next visit, and the next editor session, open on everything.
  useEffect(
    () => () => {
      useLayoutEditorStore.getState().setFilter("");
    },
    [],
  );

  useLayoutRegionLanding({ paneRef, filter, openRows, setOpenRows });

  const surfaces = SURFACE_GROUPS.filter((group) =>
    surfaceMatchesFilter(group.id, filter),
  );

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
        <div
          ref={paneRef}
          className={cn("flex flex-col", compact ? "gap-3.5" : "gap-5")}
        >
          <SettingsGroup
            group={LAYOUT.definitions.customize}
            showTitle={false}
            tone="default"
            dataTestId="layout-customize-group"
            fill={false}
          >
            <CustomizeLayoutRow />
          </SettingsGroup>
          <SettingsGroup
            group={LAYOUT.definitions.presets}
            showTitle
            tone="default"
            dataTestId="layout-presets-group"
            fill={false}
          >
            {/* No canvas here, so a preset hover previews nothing (L-43). */}
            <PresetsBlock onPreviewPreset={noop} />
          </SettingsGroup>
          <PageFilter paneRef={paneRef} />
          {surfaces.length === 0 ? (
            <div className="flex flex-wrap items-center gap-2 px-1 text-ui-sm text-muted-foreground">
              <p>No part of the app matches "{filter}".</p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  useLayoutEditorStore.getState().setFilter("");
                }}
              >
                Clear filter
              </Button>
            </div>
          ) : (
            surfaces.map((group) => {
              let surfaceRows: ReactNode = null;
              if (group.id === "statusBar")
                surfaceRows = <StatusBarSurfaceRows />;
              if (group.id === "topBar") surfaceRows = <TaskTabLayoutRow />;
              return (
                <SettingsGroup
                  key={group.id}
                  group={LAYOUT.definitions[group.id]}
                  showTitle
                  tone="default"
                  dataTestId={`layout-surface-${group.id}`}
                  fill={false}
                >
                  <SurfaceSection
                    surface={group.id}
                    snapshot={snapshot}
                    filter={filter}
                    openRows={openRows}
                    onToggleRow={toggleRow}
                    surfaceRows={surfaceRows}
                  />
                </SettingsGroup>
              );
            })
          )}
          <ResetEverythingCard snapshot={snapshot} />
        </div>
      </LayoutFormHostContext>
    </SettingsPanelShell>
  );
}

/**
 * The finder (L-07, I-11, L-125), which this page needed as soon as it stopped
 * being twenty-three sections: six cards of rows is still a page a person
 * arrives at knowing the word for what they want.
 *
 * **Sticky to the top of the settings pane**, so it is reachable from anywhere
 * on a page five cards long. No border and no shadow: the cards scroll under
 * it and the pane's own fill is the separation.
 *
 * It stays BETWEEN the presets and the surface cards rather than moving to the
 * page top, because the finder belongs immediately above the thing it filters
 * and the Settings modal's own search already occupies the top of the pane - a
 * second field up there is the duplication this whole epic is about.
 */
function PageFilter(props: {
  readonly paneRef: { current: HTMLDivElement | null };
}): ReactNode {
  const ref = useRef<HTMLInputElement | null>(null);
  return (
    <div className="sticky top-0 z-20 -mx-3 bg-background">
      {/* ArrowDown lands on the first row on the page, which is the walk L-31
        asks for and the thing this key was being taken and dropped for
        (R2-04). `setKeyboardNav` is deliberately NOT written: that flag is a
        fact about an editor SESSION, and this host has none.

        `onEnter` is `null`, not a no-op: the page has no "first match" to
        open, so Enter is left to the browser and to whatever is around this
        field (a form, the Settings modal). */}
      <RegionFilter
        ref={ref}
        onArrowDown={() => {
          focusFirstSortableRow(props.paneRef.current);
        }}
        onEnter={null}
      />
    </div>
  );
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
 * The rows that belong to a SURFACE rather than to any region on it.
 *
 * Both of the Status bar's are exactly that. `mobileFooter` decides whether the
 * strip exists at all on a narrow viewport (L-51), and `usageHost` moves BOTH
 * status-bar regions into the top bar and removes the strip - which is what the
 * preset miniature has always drawn, and what made it a surface control wearing
 * a region's clothes on the Usage limits section (D7).
 */
function StatusBarSurfaceRows(): ReactNode {
  return (
    <>
      <UsageHostRow />
      <MobileFooterRow />
    </>
  );
}

/**
 * A `SettingsRow`, not an `InspectorRow` (L-126).
 *
 * It was the last place on this page where the dock's scale sat at surface
 * level beside a `SettingsRow` at the form's (P-4), and it carried no
 * settings-search anchor, so "where does usage show" was unfindable. Its own
 * definition fixes both.
 */
function UsageHostRow(): ReactNode {
  const arrangement = useLayoutStore((state) => state.arrangement);
  const moved = arrangement.usageHost !== DEFAULT_ARRANGEMENT.usageHost;
  return (
    <SettingsRow
      row={LAYOUT.definitions.usageHost}
      control={
        <div className="flex items-center gap-1.5">
          <UsageHostControl arrangement={arrangement} />
          {moved ? (
            <RevertButton
              label="Revert where these live"
              onRevert={() => {
                writeArrangement({
                  ...arrangement,
                  usageHost: DEFAULT_ARRANGEMENT.usageHost,
                });
              }}
            />
          ) : null}
        </div>
      }
    />
  );
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
 * **The request survives the renders that make the row exist** (5.9). A target
 * inside a card the filter had taken off the page was silently dropped, so a
 * result for "Minimap" landed on nothing whenever the field still held a word
 * from a previous visit. Two writes can be what puts the row on the page -
 * clearing that filter, and opening the row's own disclosure - and both of
 * them re-render, so the row does not exist until React has committed them.
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
  readonly filter: string;
  readonly openRows: ReadonlyArray<string>;
  readonly setOpenRows: (
    update: (current: ReadonlyArray<string>) => string[],
  ) => void;
}): void {
  const { paneRef, filter, openRows, setOpenRows } = input;
  const pending = useSyncExternalStore(
    subscribePendingLayoutRegion,
    readPendingLayoutRegion,
    readPendingLayoutRegion,
  );

  useEffect(() => {
    if (pending === null) return;
    const regionId = pending.regionId;
    const hidden = filter !== "";
    const closed = !openRows.includes(regionId);
    if (hidden) useLayoutEditorStore.getState().setFilter("");
    if (closed) setOpenRows((current) => [...current, regionId]);
    if (hidden || closed) return;
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
  }, [pending, filter, openRows, paneRef, setOpenRows]);
}

/** The same mark every settings-search result leaves (`settings-search.css`). */
const LANDING_FLASH_ATTRIBUTE = "data-settings-anchor-flash";
const LANDING_FLASH_MS = 1800;

/** No canvas to preview onto, and no index row to walk to. */
function noop(): void {}
