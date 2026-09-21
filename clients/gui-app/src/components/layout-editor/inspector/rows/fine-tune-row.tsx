import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { InspectorRow } from "@/components/layout-editor/inspector/inspector-row";
import {
  SegmentedControl,
  type SegmentedControlOption,
} from "@/components/layout-editor/inspector/segmented-control";
import {
  isControlValueChanged,
  readControlValue,
  revertControlValue,
  writeControlValue,
} from "@/components/layout-editor/inspector/region-control-io";
import { fineTuneMatchesFilter } from "@/components/layout-editor/regions/region-filter-match";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import type { LayoutValues, RegionValueKey } from "@/lib/layout/layout-values";
import type { RegionId } from "@/lib/layout/region-id";

/**
 * The collapsed disclosure at the foot of a section, and the four control
 * shapes its rows are operated with.
 *
 * Every combination the curated Style examples do not list is reachable here,
 * which is what lets the examples be five rather than thirty-two (L-10).
 */

/**
 * A fine-tune row as a caller walking EVERY region sees it.
 *
 * The registry's own `FineTuneRow<K>` ties each key to its region, which does
 * not survive the walk (see `RegionRowFacts`); what does survive is
 * `RegionValueKey`, the union of every region's keys, so a row still cannot
 * name something no region has.
 */
export interface FineTuneRowFacts {
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

export function FineTuneDisclosure(props: {
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

/** The one non-boolean switch field (`compactButton`) reads `Visibility`. */
function visibilityWord(on: boolean): "shown" | "hidden" {
  return on ? "shown" : "hidden";
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
