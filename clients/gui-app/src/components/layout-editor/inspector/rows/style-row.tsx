import type { ReactNode } from "react";
import { LayoutFormRow } from "@/components/layout-editor/inspector/rows/layout-form-row";
import {
  changedControlKeys,
  revertControlValues,
} from "@/components/layout-editor/inspector/region-control-io";
import { regionStyleDepiction } from "@/components/layout-editor/region-depiction";
import { useLiveUsageArrangement } from "@/components/layout-editor/inspector/use-layout-usage";
import { type LayoutArrangement } from "@/lib/layout/layout-arrangement";
import type { LayoutValues } from "@/lib/layout/layout-values";
import type { RegionId } from "@/lib/layout/region-id";
import { cn } from "@/lib/utils";
import { useLayoutEditorStore } from "@/stores/layout/layout-editor-store";
import { useLayoutStore } from "@/stores/layout/layout-store";

/**
 * A single-value style enum (Context usage and Model's Style, Model's
 * Reasoning control), each value drawn as the real thing: a radio group of
 * pictures rather than a list of words.
 */
export function StyleRow(props: {
  readonly label: string;
  /** The one key every example writes. */
  readonly styleKey: string;
  readonly examples: ReadonlyArray<{
    readonly id: string;
    readonly label: string;
    readonly patch: Partial<LayoutValues[RegionId]>;
  }>;
  readonly regionId: RegionId;
  readonly values: LayoutValues;
  readonly arrangement: LayoutArrangement;
}): ReactNode {
  const { label, styleKey, examples, regionId, values } = props;
  const arrangement = useLiveUsageArrangement(props.arrangement);
  const regionValues = values[regionId];
  const matches = examples.map((example) =>
    Object.entries(example.patch).every(
      ([key, value]) => Reflect.get(regionValues, key) === value,
    ),
  );
  const keys = [styleKey];
  const changed = changedControlKeys(regionId, keys).length > 0;

  return (
    <LayoutFormRow
      anchor={null}
      icon={null}
      label={label}
      description={null}
      onRevert={
        changed
          ? () => {
              revertControlValues(regionId, keys);
            }
          : null
      }
      revertLabel={`Revert ${label}`}
      stacked
      control={
        <StyleExamples
          label={label}
          styleKey={styleKey}
          examples={examples}
          regionId={regionId}
          values={values}
          arrangement={arrangement}
          matches={matches}
        />
      }
    />
  );
}

function StyleExamples(props: {
  readonly label: string;
  readonly styleKey: string;
  readonly examples: ReadonlyArray<{
    readonly id: string;
    readonly label: string;
    readonly patch: Partial<LayoutValues[RegionId]>;
  }>;
  readonly regionId: RegionId;
  readonly values: LayoutValues;
  readonly arrangement: LayoutArrangement;
  readonly matches: ReadonlyArray<boolean>;
}): ReactNode {
  const { label, styleKey, examples, regionId, values, arrangement, matches } =
    props;
  return (
    <>
      <span className="mb-1.5 block text-micro text-muted-foreground uppercase">
        Sample
      </span>
      {/* The radios need an owner, or a screen reader announces orphans with
        no group name and no position in a set (G1-16). */}
      <div
        role="radiogroup"
        aria-label={label}
        className="flex flex-col gap-1.5"
      >
        {examples.map((example, index) => (
          <button
            key={example.id}
            type="button"
            aria-checked={matches[index]}
            role="radio"
            // The picture is `inert` below, so it is out of the a11y tree and
            // this radio has no name left to take from its content.
            aria-label={example.label}
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
            {/* `inert`: an example draws the REAL leaf, and for Model that leaf
              is `HarnessModelTrigger` - a genuine `<button>` nested inside a
              `role="radio"`, which is invalid markup (P-8, P-9). `inert` takes
              the picture out of focus, hit testing and the a11y tree in one,
              which leaves this radio as the row's one control. */}
            <span inert className="min-w-0 flex-1 overflow-hidden">
              {regionStyleDepiction(
                regionId,
                styleKey,
                valuesWithPatch(regionId, values, example.patch),
                arrangement,
              )}
            </span>
            <span className="shrink-0 text-ui-xs text-muted-foreground">
              {example.label}
            </span>
          </button>
        ))}
      </div>
    </>
  );
}

/**
 * `regionStyleDepiction` needs a whole `LayoutValues`, not one region's bag, so a
 * style example - which only patches ITS OWN region - is drawn against the
 * live values with just that one region swapped in.
 *
 * Written with `Reflect.set` for the same reason `region-control-io.ts` reads
 * a control's key that way: merging one branch of the region union back into
 * the whole map cannot survive generically-typed. `example.patch` always names
 * keys from the SAME region's own registry entry, so the merge is sound even
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
