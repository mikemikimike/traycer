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
import { InspectorRow } from "@/components/layout-editor/inspector/inspector-row";
import { SegmentedControl } from "@/components/layout-editor/inspector/segmented-control";
import { SpecimenStage } from "@/components/layout-editor/inspector/specimen-stage";
import {
  SortableList,
  type SortableListItem,
} from "@/components/layout-editor/inspector/sortable-list";
import {
  isControlValueChanged,
  readControlValue,
  revertControlValue,
  writeControlValue,
} from "@/components/layout-editor/inspector/region-control-io";
import {
  EDGE_SIDE_OPTIONS,
  fineTuneMatchesFilter,
  LAYOUT_REGIONS,
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
import { effectiveLayoutValues, type LayoutValues } from "@/lib/layout/layout-values";
import { providerDisplayName } from "@/lib/provider-ordering";
import type { RateLimitProviderId } from "@/lib/rate-limit-providers";
import type { RailRegionId, RegionId } from "@/lib/layout/region-id";
import { useLayoutEditorStore } from "@/stores/layout/layout-editor-store";
import { useLayoutStore, type LayoutSnapshot } from "@/stores/layout/layout-store";

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

function useSnapshot(): LayoutSnapshot {
  const basePreset = useLayoutStore((state) => state.basePreset);
  const overrides = useLayoutStore((state) => state.overrides);
  const arrangement = useLayoutStore((state) => state.arrangement);
  return { basePreset, overrides, arrangement };
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
  const snapshot = useSnapshot();
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

  function toggleShown(next: boolean): void {
    useLayoutEditorStore.getState().recordGesture(() => {
      if (isRailRegionId(regionId)) {
        useLayoutStore
          .getState()
          .setRegionValues(regionId, { shown: next ? "auto" : "hidden" });
      } else {
        useLayoutStore
          .getState()
          .setRegionValues(regionId, { shown: next ? "shown" : "hidden" });
      }
    });
  }

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
              onCheckedChange={toggleShown}
            />
          )}
        </div>
      </div>
      {isRailRegionId(regionId) && facts.hint !== null ? (
        <p className="px-3.5 pb-2 text-ui-xs text-muted-foreground">
          {facts.hint}
        </p>
      ) : null}
      <div
        className={cn(!shown && "pointer-events-none opacity-40")}
        aria-hidden={!shown}
      >
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
  const { row, regionId, host, values, arrangement, snapshot, filter, onOpenProvider } =
    props;
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
          arrangement={arrangement}
          host={host}
          onOpenProvider={onOpenProvider}
        />
      );
  }
}

function PositionOrderRow(props: {
  readonly row: Extract<AnyGrammarRow, { kind: "position-order" }>;
  readonly regionId: RegionId;
  readonly values: LayoutValues;
  readonly arrangement: LayoutArrangement;
  readonly snapshot: LayoutSnapshot;
}): ReactNode {
  const { row, regionId, values, arrangement, snapshot } = props;
  const group = row.group;

  return (
    <InspectorRow
      stacked
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
        <div className="flex flex-col gap-2">
          <SortableList
            selectedId={regionId}
            items={orderGroupItems(group, arrangement, values)}
            onReorder={(nextIds) => {
              useLayoutEditorStore.getState().recordGesture(() => {
                useLayoutStore
                  .getState()
                  .setArrangement(setOrderGroup(arrangement, group, nextIds));
              });
            }}
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

function toggleRegionShown(regionId: RegionId, values: LayoutValues): void {
  const shownRaw = readControlValue(values[regionId], "shown");
  const next = shownRaw === "hidden";
  useLayoutEditorStore.getState().recordGesture(() => {
    if (isRailRegionId(regionId)) {
      useLayoutStore
        .getState()
        .setRegionValues(regionId, { shown: next ? "auto" : "hidden" });
    } else {
      useLayoutStore
        .getState()
        .setRegionValues(regionId, { shown: next ? "shown" : "hidden" });
    }
  });
}

function regionOrderItem(
  regionId: RegionId,
  values: LayoutValues,
): SortableListItem {
  const facts = regionFacts(regionId);
  const shownRaw = readControlValue(values[regionId], "shown");
  return {
    id: regionId,
    label: facts.name,
    icon: facts.icon,
    shown: shownRaw !== "hidden",
    onToggleShown: () => {
      toggleRegionShown(regionId, values);
    },
    onActivate: null,
  };
}

/**
 * One order group's list rows. Built per group rather than off one opaque
 * `ReadonlyArray<string>`, because only the rail actually mixes panels and
 * dividers - every other group's members are already known to be regions, so
 * building the list straight off the arrangement's own typed arrays needs no
 * runtime guess about what an id names. `usageProviders` has no
 * `position-order` row of its own - the registry reaches the provider list
 * through the `children` row instead (`ProvidersChildrenRow`) - so this
 * branch only completes the switch over every `OrderGroupId`.
 */
function orderGroupItems(
  group: OrderGroupId,
  arrangement: LayoutArrangement,
  values: LayoutValues,
): ReadonlyArray<SortableListItem> {
  switch (group) {
    case "dock":
      return arrangement.dock.map((id) => regionOrderItem(id, values));
    case "toolbarLeft":
      return arrangement.toolbarLeft.map((id) => regionOrderItem(id, values));
    case "toolbarRight":
      return arrangement.toolbarRight.map((id) => regionOrderItem(id, values));
    case "usageProviders":
      return arrangement.usageProviders.map((id) => ({
        id,
        label: providerDisplayName(id),
        icon: null,
        shown: !arrangement.hiddenProviders.includes(id),
        onToggleShown: () => {
          toggleHiddenProvider(id, arrangement);
        },
        onActivate: null,
      }));
    case "rail":
      return arrangement.rail.map((entry) =>
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
      );
  }
}

function toggleHiddenProvider(
  providerId: RateLimitProviderId,
  arrangement: LayoutArrangement,
): void {
  useLayoutEditorStore.getState().recordGesture(() => {
    const hidden = arrangement.hiddenProviders.includes(providerId)
      ? arrangement.hiddenProviders.filter((entry) => entry !== providerId)
      : [...arrangement.hiddenProviders, providerId];
    useLayoutStore
      .getState()
      .setArrangement({ ...arrangement, hiddenProviders: hidden });
  });
}

function setOrderGroup(
  arrangement: LayoutArrangement,
  group: OrderGroupId,
  nextIds: ReadonlyArray<string>,
): LayoutArrangement {
  switch (group) {
    case "dock":
      return { ...arrangement, dock: asRegionIds(nextIds, arrangement.dock) };
    case "toolbarLeft":
      return {
        ...arrangement,
        toolbarLeft: asRegionIds(nextIds, arrangement.toolbarLeft),
      };
    case "toolbarRight":
      return {
        ...arrangement,
        toolbarRight: asRegionIds(nextIds, arrangement.toolbarRight),
      };
    case "rail":
      return {
        ...arrangement,
        rail: nextIds.flatMap((id) => {
          const entry = arrangement.rail.find((candidate) => candidate.id === id);
          return entry === undefined ? [] : [entry];
        }),
      };
    case "usageProviders":
      return {
        ...arrangement,
        usageProviders: asRegionIds(nextIds, arrangement.usageProviders),
      };
  }
}

/** `nextIds` reordered `canonical`, dropping anything reorder cannot have added. */
function asRegionIds<Id extends string>(
  nextIds: ReadonlyArray<string>,
  canonical: ReadonlyArray<Id>,
): ReadonlyArray<Id> {
  return nextIds.flatMap((id) => {
    const match = canonical.find((candidate) => candidate === id);
    return match === undefined ? [] : [match];
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

  return (
    <div className="border-t border-border px-3.5 py-3">
      <div className="mb-2 text-overline text-muted-foreground uppercase">
        Style
      </div>
      <div className="flex flex-col gap-1.5">
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
                useLayoutStore.getState().setRegionValues(regionId, example.patch);
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
          Custom - no example matches the fine-tune below.
        </p>
      ) : null}
      {description ? (
        <p className="mt-1.5 text-ui-xs text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
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

function FineTuneDisclosure(props: {
  readonly rows: ReadonlyArray<{
    readonly id: string;
    readonly label: string;
    readonly description: string | null;
    readonly control:
      | { readonly kind: "switch"; readonly key: string }
      | {
          readonly kind: "segment";
          readonly key: string;
          readonly options: ReadonlyArray<{ readonly value: string; readonly label: string }>;
        }
      | {
          readonly kind: "checks";
          readonly keys: ReadonlyArray<string>;
          readonly options: ReadonlyArray<{ readonly value: string; readonly label: string }>;
        }
      | {
          readonly kind: "field-checks";
          readonly key: string;
          readonly options: ReadonlyArray<{ readonly value: string; readonly label: string }>;
        };
  }>;
  readonly regionId: RegionId;
  readonly regionValues: LayoutValues[RegionId];
  readonly filter: string;
}): ReactNode {
  const { rows, regionId, regionValues, filter } = props;
  const [manuallyOpen, setManuallyOpen] = useState<boolean | null>(null);
  const open = manuallyOpen ?? fineTuneMatchesFilter(regionId, filter);

  return (
    <Collapsible
      open={open}
      onOpenChange={setManuallyOpen}
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
  readonly row: {
    readonly id: string;
    readonly label: string;
    readonly description: string | null;
    readonly control:
      | { readonly kind: "switch"; readonly key: string }
      | {
          readonly kind: "segment";
          readonly key: string;
          readonly options: ReadonlyArray<{ readonly value: string; readonly label: string }>;
        }
      | {
          readonly kind: "checks";
          readonly keys: ReadonlyArray<string>;
          readonly options: ReadonlyArray<{ readonly value: string; readonly label: string }>;
        }
      | {
          readonly kind: "field-checks";
          readonly key: string;
          readonly options: ReadonlyArray<{ readonly value: string; readonly label: string }>;
        };
  };
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
              const value = typeof current === "boolean" ? next : visibilityWord(next);
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
  return (
    <InspectorRow
      stacked
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
        <div className="flex flex-col gap-1.5">
          {control.options.map((option) => {
            const checked = selected.includes(option.value);
            return (
              <label
                key={option.value}
                className="flex items-center gap-2 text-ui-sm"
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={(next) => {
                    const nextList = control.options
                      .map((entry) => entry.value)
                      .filter((value) =>
                        value === option.value ? next === true : selected.includes(value),
                      );
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

function ProvidersChildrenRow(props: {
  readonly arrangement: LayoutArrangement;
  readonly host: "inspector" | "page";
  readonly onOpenProvider: ((providerId: string) => void) | null;
}): ReactNode {
  const { arrangement, host, onOpenProvider } = props;
  const opensSecondLevel = host === "inspector" && onOpenProvider !== null;
  return (
    <div className="border-t border-border px-3.5 py-3">
      <div className="mb-2 text-overline text-muted-foreground uppercase">
        Providers
      </div>
      <SortableList
        selectedId={null}
        items={arrangement.usageProviders.map((providerId) => ({
          id: providerId,
          label: providerDisplayName(providerId),
          icon: null,
          shown: !arrangement.hiddenProviders.includes(providerId),
          onToggleShown: () => {
            toggleHiddenProvider(providerId, arrangement);
          },
          onActivate: opensSecondLevel
            ? () => {
                onOpenProvider(providerId);
              }
            : null,
        }))}
        onReorder={(nextIds) => {
          useLayoutEditorStore.getState().recordGesture(() => {
            useLayoutStore.getState().setArrangement({
              ...arrangement,
              usageProviders: asRegionIds(nextIds, arrangement.usageProviders),
            });
          });
        }}
      />
      {opensSecondLevel ? (
        <p className="mt-1.5 text-ui-xs text-muted-foreground">
          Open a provider for its limits.
        </p>
      ) : null}
    </div>
  );
}
