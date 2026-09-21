import type { ReactNode } from "react";
import { RevertButton } from "@/components/layout-editor/inspector/inspector-row";
import {
  changedControlKeys,
  revertControlValues,
} from "@/components/layout-editor/inspector/region-control-io";
import { NO_EXAMPLE_MATCH_COPY } from "@/components/layout-editor/regions/region-grammar";
import { regionDepiction } from "@/components/layout-editor/region-depiction";
import type { LayoutArrangement } from "@/lib/layout/layout-arrangement";
import type { LayoutValues } from "@/lib/layout/layout-values";
import type { RegionId } from "@/lib/layout/region-id";
import { cn } from "@/lib/utils";
import { useLayoutEditorStore } from "@/stores/layout/layout-editor-store";
import { useLayoutStore } from "@/stores/layout/layout-store";

/**
 * The curated readings a region can be set to, each drawn as the real thing
 * (L-10): a radio group of pictures rather than a list of words.
 */
export function StyleRow(props: {
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
