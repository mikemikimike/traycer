import { useState, type ReactNode } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  InspectorRow,
  RevertButton,
} from "@/components/layout-editor/inspector/inspector-row";
import {
  SegmentedControl,
  type SegmentedControlOption,
} from "@/components/layout-editor/inspector/segmented-control";
import { SpecimenStage } from "@/components/layout-editor/inspector/specimen-stage";
import {
  SortableList,
  type SortableListItem,
} from "@/components/layout-editor/inspector/sortable-list";
import {
  changedControlKeys,
  isControlValueChanged,
  readControlValue,
  revertControlValue,
  revertControlValues,
  writeControlValue,
} from "@/components/layout-editor/inspector/region-control-io";
import {
  EDGE_SIDE_OPTIONS,
  fineTuneMatchesFilter,
  LAYOUT_REGIONS,
  NO_EXAMPLE_MATCH_COPY,
  positionRowChanged,
  regionDepiction,
  regionFacts,
  revertPositionRow,
  SIZE_OPTIONS,
  USAGE_HOST_OPTIONS,
} from "@/lib/layout/layout-regions";
import {
  RAIL_REGION_IDS,
  type LayoutArrangement,
  type OrderGroupId,
} from "@/lib/layout/layout-arrangement";
import type { DockRegionId, ToolbarRegionId } from "@/lib/layout/region-id";
import {
  effectiveLayoutValues,
  type LayoutValues,
  type RegionValueKey,
} from "@/lib/layout/layout-values";
import { providerDisplayName } from "@/lib/provider-ordering";
import type { RateLimitProviderId } from "@/lib/rate-limit-providers";
import type { RailRegionId, RegionId } from "@/lib/layout/region-id";
import { useLayoutEditorStore } from "@/stores/layout/layout-editor-store";
import {
  useLayoutSnapshot,
  useLayoutStore,
  type LayoutSnapshot,
} from "@/stores/layout/layout-store";

interface RegionSectionProps {
  readonly regionId: RegionId;
  /** The same section renders in both hosts (L-03); only the children row differs. */
  readonly host: "inspector" | "page";
  readonly onOpenProvider: ((providerId: string) => void) | null;
}

function isRailRegionId(id: RegionId): id is RailRegionId {
  return RAIL_REGION_IDS.some((candidate) => candidate === id);
}

/** The one non-boolean switch field (`compactButton`) reads `Visibility`. */
function visibilityWord(on: boolean): "shown" | "hidden" {
  return on ? "shown" : "hidden";
}

/**
 * One region's section, in the fixed grammar order (L-08): stage, header with
 * Shown, Size, Position, Style, Fine-tune (collapsed), children - rows that do
 * not apply are omitted. Nothing here is written per region: every row comes
 * off `LAYOUT_REGIONS[regionId].rows`, which is what keeps the docked
 * inspector and the full-width `Settings > Layout` host the same form (L-03).
 */
export function RegionSection(props: RegionSectionProps): ReactNode {
  const { regionId, host, onOpenProvider } = props;
  const snapshot = useLayoutSnapshot();
  const filter = useLayoutEditorStore((state) => state.filter);
  const values = effectiveLayoutValues(snapshot.basePreset, snapshot.overrides);
  const arrangement = snapshot.arrangement;
  const region = LAYOUT_REGIONS[regionId];
  const facts = regionFacts(regionId);
  const shownValue = values[regionId].shown;
  const shown = shownValue !== "hidden";
  const where =
    facts.whereByHost !== null
      ? facts.whereByHost[arrangement.usageHost]
      : facts.where;

  function setRailVisibility(next: string): void {
    if (!isRailRegionId(regionId)) return;
    if (next !== "auto" && next !== "shown" && next !== "hidden") return;
    useLayoutEditorStore.getState().recordGesture(() => {
      useLayoutStore.getState().setRegionValues(regionId, { shown: next });
    });
  }

  return (
    <div className="flex flex-col">
      <SpecimenStage off={!shown}>
        {regionDepiction(regionId, values, arrangement)}
      </SpecimenStage>
      <div className="flex items-start gap-2.5 px-3.5 pt-3.5 pb-3">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-foreground">
          <facts.icon className="size-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-ui-sm font-medium">{facts.name}</div>
          <div className="mt-0.5 text-ui-xs text-muted-foreground">{where}</div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {isRailRegionId(regionId) && facts.hint !== null ? (
            <SegmentedControl
              ariaLabel={`${facts.name} visibility`}
              value={shownValue}
              onChange={setRailVisibility}
              options={[
                { value: "auto", label: "Auto" },
                { value: "shown", label: "Shown" },
                { value: "hidden", label: "Hidden" },
              ]}
            />
          ) : (
            <Switch
              aria-label={`Show ${facts.name}`}
              checked={shown}
              onCheckedChange={() => {
                setRegionShown(regionId, !shown);
              }}
            />
          )}
        </div>
      </div>
      {isRailRegionId(regionId) && facts.hint !== null ? (
        <p className="px-3.5 pb-2 text-ui-xs text-muted-foreground">
          {facts.hint}
        </p>
      ) : null}
      {/* `inert`, not `aria-hidden`: `aria-hidden` leaves its descendants in
        the tab order, so a keyboard user landed inside the greyed rows of a
        hidden region - and `pointer-events-none` did not stop that either.
        `inert` removes focus, hit testing and the a11y tree in one, and
        subsumes the pointer rule (G1-06). */}
      <div inert={!shown} className={cn(!shown && "opacity-40")}>
        {region.rows.map((row) => (
          // Each grammar row kind appears at most once per region (L-08), so
          // `row.kind` is a stable key without an index.
          <GrammarRowView
            key={row.kind}
            row={row}
            regionId={regionId}
            host={host}
            values={values}
            arrangement={arrangement}
            snapshot={snapshot}
            filter={filter}
            onOpenProvider={onOpenProvider}
          />
        ))}
      </div>
    </div>
  );
}

type AnyGrammarRow = (typeof LAYOUT_REGIONS)[RegionId]["rows"][number];

function GrammarRowView(props: {
  readonly row: AnyGrammarRow;
  readonly regionId: RegionId;
  readonly host: "inspector" | "page";
  readonly values: LayoutValues;
  readonly arrangement: LayoutArrangement;
  readonly snapshot: LayoutSnapshot;
  readonly filter: string;
  readonly onOpenProvider: ((providerId: string) => void) | null;
}): ReactNode {
  const {
    row,
    regionId,
    host,
    values,
    arrangement,
    snapshot,
    filter,
    onOpenProvider,
  } = props;
  const regionValues = values[regionId];

  switch (row.kind) {
    case "size":
      return (
        <InspectorRow
          top
          label="Size"
          description={row.description}
          onRevert={
            isControlValueChanged(regionId, "size")
              ? () => {
                  revertControlValue(regionId, "size");
                }
              : undefined
          }
          control={
            <SegmentedControl
              ariaLabel="Size"
              options={SIZE_OPTIONS}
              value={String(readControlValue(regionValues, "size"))}
              onChange={(next) => {
                writeControlValue(regionId, "size", next);
              }}
            />
          }
        />
      );
    case "position-host":
      return (
        <InspectorRow
          label="Position"
          description={row.description}
          onRevert={
            positionRowChanged(snapshot, regionId)
              ? () => {
                  useLayoutEditorStore.getState().recordGesture(() => {
                    useLayoutStore
                      .getState()
                      .setArrangement(revertPositionRow(arrangement, regionId));
                  });
                }
              : undefined
          }
          control={
            <SegmentedControl
              ariaLabel="Position"
              options={USAGE_HOST_OPTIONS}
              value={arrangement.usageHost}
              onChange={(next) => {
                if (next !== "status-bar" && next !== "header") return;
                useLayoutEditorStore.getState().recordGesture(() => {
                  useLayoutStore
                    .getState()
                    .setArrangement({ ...arrangement, usageHost: next });
                });
              }}
            />
          }
        />
      );
    case "position-side": {
      const sideKey = regionId === "minimap" ? "minimapSide" : "resourceSide";
      return (
        <InspectorRow
          label="Position"
          description={row.description}
          onRevert={
            positionRowChanged(snapshot, regionId)
              ? () => {
                  useLayoutEditorStore.getState().recordGesture(() => {
                    useLayoutStore
                      .getState()
                      .setArrangement(revertPositionRow(arrangement, regionId));
                  });
                }
              : undefined
          }
          control={
            <SegmentedControl
              ariaLabel="Position"
              options={EDGE_SIDE_OPTIONS}
              value={arrangement[sideKey]}
              onChange={(next) => {
                if (next !== "left" && next !== "right") return;
                useLayoutEditorStore.getState().recordGesture(() => {
                  useLayoutStore
                    .getState()
                    .setArrangement({ ...arrangement, [sideKey]: next });
                });
              }}
            />
          }
        />
      );
    }
    case "position-order":
      return (
        <PositionOrderRow
          row={row}
          regionId={regionId}
          values={values}
          arrangement={arrangement}
          snapshot={snapshot}
        />
      );
    case "style":
      return (
        <StyleRow
          examples={row.examples}
          description={row.description}
          regionId={regionId}
          values={values}
          arrangement={arrangement}
        />
      );
    case "fine-tune":
      return (
        <FineTuneDisclosure
          rows={row.rows}
          regionId={regionId}
          regionValues={regionValues}
          filter={filter}
        />
      );
    case "children":
      return (
        <ProvidersChildrenRow
          values={values}
          arrangement={arrangement}
          host={host}
          onOpenProvider={onOpenProvider}
        />
      );
    default:
      return assertNever(row);
  }
}

/**
 * The closing case of a switch over a closed union.
 *
 * Both switches below return `ReactNode`, which INCLUDES `undefined`, so
 * falling off the end of either is something TypeScript accepts in silence: a
 * grammar row kind or an order group added later would render nothing and say
 * nothing (G1-22). A local helper rather than a shared one, which is the same
 * shape the three other `assertNever`s in this app take.
 */
function assertNever(value: never): never {
  throw new Error(`unhandled layout section member: ${JSON.stringify(value)}`);
}

function PositionOrderRow(props: {
  readonly row: Extract<AnyGrammarRow, { kind: "position-order" }>;
  readonly regionId: RegionId;
  readonly values: LayoutValues;
  readonly arrangement: LayoutArrangement;
  readonly snapshot: LayoutSnapshot;
}): ReactNode {
  const { row, regionId, values, arrangement, snapshot } = props;

  return (
    <InspectorRow
      stacked
      label="Position"
      description={row.description}
      onRevert={
        positionRowChanged(snapshot, regionId)
          ? () => {
              writeArrangement(revertPositionRow(arrangement, regionId));
            }
          : undefined
      }
      control={
        <div className="flex flex-col gap-2">
          <OrderGroupList
            group={row.group}
            selectedId={regionId}
            values={values}
            arrangement={arrangement}
            onOpenProvider={null}
          />
          {row.pinnedRight ? (
            <p className="text-ui-xs text-muted-foreground">
              The model chip stays on the right.
            </p>
          ) : null}
        </div>
      }
    />
  );
}

/** The one rule for a region's Shown switch, tri-state rail included (L-47). */
function setRegionShown(regionId: RegionId, next: boolean): void {
  // A rail panel turned back ON goes to `auto` rather than `shown`: its own
  // presence rule is the default, and pinning it open is a separate answer the
  // three-state control above gives (L-47).
  const onValue = isRailRegionId(regionId) ? "auto" : "shown";
  const shown = next ? onValue : "hidden";
  useLayoutEditorStore.getState().recordGesture(() => {
    useLayoutStore.getState().setRegionValues(regionId, { shown });
  });
}

/** Every arrangement write from this section, as one recorded gesture. */
function writeArrangement(arrangement: LayoutArrangement): void {
  useLayoutEditorStore.getState().recordGesture(() => {
    useLayoutStore.getState().setArrangement(arrangement);
  });
}

function regionOrderItem<Id extends RegionId>(
  regionId: Id,
  values: LayoutValues,
): SortableListItem<Id> {
  const facts = regionFacts(regionId);
  return {
    id: regionId,
    label: facts.name,
    icon: facts.icon,
    shown: readControlValue(values[regionId], "shown") !== "hidden",
    onToggleShown: () => {
      setRegionShown(
        regionId,
        readControlValue(values[regionId], "shown") === "hidden",
      );
    },
    onActivate: null,
  };
}

/**
 * The usage providers as list rows, with the second level wired only where
 * there is one to open.
 *
 * One builder for both callers: the `usageProviders` order group and the
 * Usage limits section's own children row draw the SAME list, and writing it
 * twice left the order-group branch unreachable and drifting (G1-13).
 */
function providerOrderItems(
  arrangement: LayoutArrangement,
  onOpenProvider: ((providerId: RateLimitProviderId) => void) | null,
): ReadonlyArray<SortableListItem<RateLimitProviderId>> {
  return arrangement.usageProviders.map((providerId) => ({
    id: providerId,
    label: providerDisplayName(providerId),
    icon: null,
    shown: !arrangement.hiddenProviders.includes(providerId),
    onToggleShown: () => {
      toggleHiddenProvider(providerId, arrangement);
    },
    onActivate:
      onOpenProvider === null
        ? null
        : () => {
            onOpenProvider(providerId);
          },
  }));
}

/**
 * One order group's sortable list, typed in that group's own ids.
 *
 * Written as a branch per group rather than through one `ReadonlyArray<string>`
 * seam: only the rail actually mixes two kinds of id, and widening every group
 * to `string` meant re-narrowing each id back on the way out, where a
 * mis-routed id was silently DROPPED instead of failing (G1-23).
 */
function OrderGroupList(props: {
  readonly group: OrderGroupId;
  readonly selectedId: RegionId | null;
  readonly values: LayoutValues;
  readonly arrangement: LayoutArrangement;
  readonly onOpenProvider: ((providerId: RateLimitProviderId) => void) | null;
}): ReactNode {
  const { group, selectedId, values, arrangement, onOpenProvider } = props;
  switch (group) {
    case "dock":
      return (
        <SortableList<DockRegionId>
          selectedId={selectedId}
          items={arrangement.dock.map((id) => regionOrderItem(id, values))}
          onReorder={(dock) => {
            writeArrangement({ ...arrangement, dock });
          }}
        />
      );
    case "toolbarLeft":
      return (
        <SortableList<ToolbarRegionId>
          selectedId={selectedId}
          items={arrangement.toolbarLeft.map((id) =>
            regionOrderItem(id, values),
          )}
          onReorder={(toolbarLeft) => {
            writeArrangement({ ...arrangement, toolbarLeft });
          }}
        />
      );
    case "toolbarRight":
      return (
        <SortableList<ToolbarRegionId>
          selectedId={selectedId}
          items={arrangement.toolbarRight.map((id) =>
            regionOrderItem(id, values),
          )}
          onReorder={(toolbarRight) => {
            writeArrangement({ ...arrangement, toolbarRight });
          }}
        />
      );
    case "usageProviders":
      return (
        <SortableList<RateLimitProviderId>
          selectedId={selectedId}
          items={providerOrderItems(arrangement, onOpenProvider)}
          onReorder={(usageProviders) => {
            writeArrangement({ ...arrangement, usageProviders });
          }}
        />
      );
    case "rail":
      return (
        <SortableList<string>
          selectedId={selectedId}
          items={arrangement.rail.map((entry) =>
            entry.kind === "divider"
              ? {
                  id: entry.id,
                  label: "Divider",
                  icon: null,
                  shown: null,
                  onToggleShown: null,
                  onActivate: null,
                }
              : regionOrderItem(entry.id, values),
          )}
          onReorder={(ids) => {
            // One lookup table rather than a `find` per id: ticket 09 drives
            // this from a drag, where the list is walked every frame.
            const byId = new Map(arrangement.rail.map((e) => [e.id, e]));
            writeArrangement({
              ...arrangement,
              rail: ids.flatMap((id) => {
                const entry = byId.get(id);
                return entry === undefined ? [] : [entry];
              }),
            });
          }}
        />
      );
    default:
      return assertNever(group);
  }
}

function toggleHiddenProvider(
  providerId: RateLimitProviderId,
  arrangement: LayoutArrangement,
): void {
  writeArrangement({
    ...arrangement,
    hiddenProviders: arrangement.hiddenProviders.includes(providerId)
      ? arrangement.hiddenProviders.filter((entry) => entry !== providerId)
      : [...arrangement.hiddenProviders, providerId],
  });
}

function StyleRow(props: {
  readonly examples: ReadonlyArray<{
    readonly id: string;
    readonly label: string;
    readonly patch: Partial<LayoutValues[RegionId]>;
  }>;
  readonly description: string | null;
  readonly regionId: RegionId;
  readonly values: LayoutValues;
  readonly arrangement: LayoutArrangement;
}): ReactNode {
  const { examples, description, regionId, values, arrangement } = props;
  const regionValues = values[regionId];
  const matches = examples.map((example) =>
    Object.entries(example.patch).every(
      ([key, value]) => Reflect.get(regionValues, key) === value,
    ),
  );
  const anyMatch = matches.some((match) => match);
  // Every key any example writes, which is what this block as a whole owns -
  // picking "bar only" writes five of them, so a revert that only offered the
  // five Fine-tune rows individually was not the "each changed row has its own
  // revert" L-20 asks for (G1-17).
  const keys = exampleKeys(examples);
  const changed = changedControlKeys(regionId, keys).length > 0;

  return (
    <div className="border-t border-border px-3.5 py-3">
      <div className="mb-2 flex items-center gap-2">
        <div className="min-w-0 flex-1 text-overline text-muted-foreground uppercase">
          Style
        </div>
        {changed ? (
          <RevertButton
            label="Revert Style"
            onRevert={() => {
              revertControlValues(regionId, keys);
            }}
          />
        ) : null}
      </div>
      {/* The radios need an owner, or a screen reader announces five orphans
        with no group name and no position in a set (G1-16). */}
      <div
        role="radiogroup"
        aria-label="Style"
        className="flex flex-col gap-1.5"
      >
        {examples.map((example, index) => (
          <button
            key={example.id}
            type="button"
            aria-checked={matches[index]}
            role="radio"
            className={cn(
              "flex items-center gap-2.5 rounded-lg border border-border bg-card px-2.5 py-2 text-left transition-colors active:press-scrim",
              matches[index] && "border-foreground",
            )}
            onClick={() => {
              useLayoutEditorStore.getState().recordGesture(() => {
                useLayoutStore
                  .getState()
                  .setRegionValues(regionId, example.patch);
              });
            }}
          >
            <span
              className={cn(
                "relative size-3.5 shrink-0 rounded-full border border-input",
                matches[index] &&
                  "border-foreground after:absolute after:inset-0.75 after:rounded-full after:bg-foreground after:content-['']",
              )}
            />
            <span className="min-w-0 flex-1 overflow-hidden">
              {regionDepiction(
                regionId,
                valuesWithPatch(regionId, values, example.patch),
                arrangement,
              )}
            </span>
          </button>
        ))}
      </div>
      {!anyMatch ? (
        <p className="mt-1.5 text-ui-xs text-muted-foreground">
          {NO_EXAMPLE_MATCH_COPY}
        </p>
      ) : null}
      {description ? (
        <p className="mt-1.5 text-ui-xs text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}

/** Every key the Style block's examples write, each named once. */
function exampleKeys(
  examples: ReadonlyArray<{
    readonly patch: Partial<LayoutValues[RegionId]>;
  }>,
): ReadonlyArray<string> {
  const keys = new Set<string>();
  for (const example of examples) {
    for (const key of Object.keys(example.patch)) keys.add(key);
  }
  return [...keys];
}

/**
 * `regionDepiction` needs a whole `LayoutValues`, not one region's bag, so a
 * style example - which only patches ITS OWN region - is drawn against the
 * live values with just that one region swapped in.
 *
 * Written with `Reflect.set` for the same reason `region-control-io.ts` reads
 * a control's key that way: merging one branch of a twenty-two-branch union
 * back into the whole map is exactly the case `RegionRowFacts`'s own comment
 * says cannot survive generically-typed. `example.patch` always names keys
 * from the SAME region's own registry entry, so the merge is sound even
 * though its static type cannot say so.
 */
function valuesWithPatch(
  regionId: RegionId,
  values: LayoutValues,
  patch: Partial<LayoutValues[RegionId]>,
): LayoutValues {
  const next: LayoutValues = { ...values };
  const region: object = { ...values[regionId] };
  Object.assign(region, patch);
  Reflect.set(next, regionId, region);
  return next;
}

/**
 * A fine-tune row as a caller walking EVERY region sees it.
 *
 * The registry's own `FineTuneRow<K>` ties each key to its region, which does
 * not survive the walk (see `RegionRowFacts`); what does survive is
 * `RegionValueKey`, the union of every region's keys, so a row still cannot
 * name something no region has.
 */
interface FineTuneRowFacts {
  readonly id: string;
  readonly label: string;
  readonly description: string | null;
  readonly control:
    | { readonly kind: "switch"; readonly key: RegionValueKey }
    | {
        readonly kind: "segment";
        readonly key: RegionValueKey;
        readonly options: ReadonlyArray<SegmentedControlOption>;
      }
    | {
        readonly kind: "checks";
        readonly keys: ReadonlyArray<RegionValueKey>;
        readonly options: ReadonlyArray<SegmentedControlOption>;
      }
    | {
        readonly kind: "field-checks";
        readonly key: RegionValueKey;
        readonly options: ReadonlyArray<SegmentedControlOption>;
      };
}

function FineTuneDisclosure(props: {
  readonly rows: ReadonlyArray<FineTuneRowFacts>;
  readonly regionId: RegionId;
  readonly regionValues: LayoutValues[RegionId];
  readonly filter: string;
}): ReactNode {
  const { rows, regionId, regionValues, filter } = props;
  const [manuallyOpen, setManuallyOpen] = useState<boolean | null>(null);
  // The manual answer is scoped to the filter that was in force when it was
  // given: without this, opening Fine-tune once and closing it again silenced
  // L-07's auto-expand for the rest of the session, so typing a word that only
  // matches a fine-tune label looked like no match at all (G1-20).
  const [openedUnder, setOpenedUnder] = useState(filter);
  const manual = openedUnder === filter ? manuallyOpen : null;
  const open = manual ?? fineTuneMatchesFilter(regionId, filter);

  return (
    <Collapsible
      open={open}
      onOpenChange={(next) => {
        setManuallyOpen(next);
        setOpenedUnder(filter);
      }}
      className="border-t border-border"
    >
      <CollapsibleTrigger
        variant="panel"
        className="group flex w-full items-center text-left text-ui-sm"
      >
        <ChevronRight className="size-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
        <span>Fine-tune ({rows.length})</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        {rows.map((row) => (
          <FineTuneRowView
            key={row.id}
            row={row}
            regionId={regionId}
            regionValues={regionValues}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

function FineTuneRowView(props: {
  readonly row: FineTuneRowFacts;
  readonly regionId: RegionId;
  readonly regionValues: LayoutValues[RegionId];
}): ReactNode {
  const { row, regionId, regionValues } = props;
  const { control } = row;

  if (control.kind === "switch") {
    const value = readControlValue(regionValues, control.key);
    const checked = typeof value === "boolean" ? value : value === "shown";
    return (
      <InspectorRow
        label={row.label}
        description={row.description ?? undefined}
        onRevert={
          isControlValueChanged(regionId, control.key)
            ? () => {
                revertControlValue(regionId, control.key);
              }
            : undefined
        }
        control={
          <Switch
            aria-label={row.label}
            checked={checked}
            onCheckedChange={(next) => {
              const current = readControlValue(regionValues, control.key);
              const value =
                typeof current === "boolean" ? next : visibilityWord(next);
              writeControlValue(regionId, control.key, value);
            }}
          />
        }
      />
    );
  }

  if (control.kind === "segment") {
    const value = String(readControlValue(regionValues, control.key));
    return (
      <InspectorRow
        label={row.label}
        description={row.description ?? undefined}
        onRevert={
          isControlValueChanged(regionId, control.key)
            ? () => {
                revertControlValue(regionId, control.key);
              }
            : undefined
        }
        control={
          <SegmentedControl
            ariaLabel={row.label}
            options={control.options}
            value={value}
            onChange={(next) => {
              writeControlValue(regionId, control.key, next);
            }}
          />
        }
      />
    );
  }

  if (control.kind === "checks") {
    return (
      <InspectorRow
        stacked
        label={row.label}
        description={row.description ?? undefined}
        onRevert={
          control.keys.some((key) => isControlValueChanged(regionId, key))
            ? () => {
                control.keys.forEach((key) => {
                  revertControlValue(regionId, key);
                });
              }
            : undefined
        }
        control={
          <div className="flex flex-col gap-1.5">
            {control.options.map((option, index) => {
              const key = control.keys[index];
              const checked = readControlValue(regionValues, key) === true;
              return (
                <label
                  key={option.value}
                  className="flex items-center gap-2 text-ui-sm"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(next) => {
                      writeControlValue(regionId, key, next === true);
                    }}
                  />
                  {option.label}
                </label>
              );
            })}
          </div>
        }
      />
    );
  }

  const currentList = readControlValue(regionValues, control.key);
  const selected = Array.isArray(currentList) ? currentList : [];
  // The list cannot be emptied. An empty pinned breakdown is not a state the
  // card has - it would draw an empty box - so the resolver drops it, and
  // before this guard the user emptied the list, watched the card go blank for
  // the session and found every row back on the next launch (G1-07).
  const last = selected.length <= 1;
  return (
    <InspectorRow
      stacked
      label={row.label}
      description={row.description ?? "At least one row stays in the card."}
      onRevert={
        isControlValueChanged(regionId, control.key)
          ? () => {
              revertControlValue(regionId, control.key);
            }
          : undefined
      }
      control={
        <div className="flex flex-col gap-1.5">
          {control.options.map((option) => {
            const checked = selected.includes(option.value);
            // Named rather than written inline: `react/jsx-no-leaked-render`
            // autofixes a `&&` in a JSX position into `? … : null`, and
            // `disabled` takes a boolean.
            const locked = checked && last;
            return (
              <label
                key={option.value}
                className="flex items-center gap-2 text-ui-sm"
              >
                <Checkbox
                  checked={checked}
                  disabled={locked}
                  onCheckedChange={(next) => {
                    const nextList = control.options
                      .map((entry) => entry.value)
                      .filter((value) =>
                        value === option.value
                          ? next === true
                          : selected.includes(value),
                      );
                    if (nextList.length === 0) return;
                    writeControlValue(regionId, control.key, nextList);
                  }}
                />
                {option.label}
              </label>
            );
          })}
        </div>
      }
    />
  );
}

/**
 * Usage limits' own second level (L-26): the same provider list the
 * `usageProviders` order group draws, with the rows opening a provider where
 * there is a level to open.
 */
function ProvidersChildrenRow(props: {
  readonly values: LayoutValues;
  readonly arrangement: LayoutArrangement;
  readonly host: "inspector" | "page";
  readonly onOpenProvider: ((providerId: string) => void) | null;
}): ReactNode {
  const { values, arrangement, host, onOpenProvider } = props;
  const opensSecondLevel = host === "inspector" && onOpenProvider !== null;
  return (
    <div className="border-t border-border px-3.5 py-3">
      <div className="mb-2 text-overline text-muted-foreground uppercase">
        Providers
      </div>
      <OrderGroupList
        group="usageProviders"
        selectedId={null}
        values={values}
        arrangement={arrangement}
        onOpenProvider={
          opensSecondLevel
            ? (providerId) => {
                onOpenProvider(providerId);
              }
            : null
        }
      />
      {opensSecondLevel ? (
        <p className="mt-1.5 text-ui-xs text-muted-foreground">
          Open a provider for its limits.
        </p>
      ) : null}
    </div>
  );
}
