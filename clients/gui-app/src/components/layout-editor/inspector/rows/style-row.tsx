import type { ReactNode } from "react";
import { RevertButton } from "@/components/layout-editor/inspector/inspector-row";
import {
  changedControlKeys,
  revertControlValues,
} from "@/components/layout-editor/inspector/region-control-io";
import {
  NO_EXAMPLE_MATCH_COPY,
  type StyleSpecimen,
} from "@/components/layout-editor/regions/region-grammar";
import {
  depictUsageProvider,
  regionDepiction,
} from "@/components/layout-editor/region-depiction";
import {
  USAGE_PROVIDER_IDS,
  type LayoutArrangement,
} from "@/lib/layout/layout-arrangement";
import type { RateLimitProviderId } from "@/lib/rate-limit-providers";
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
  readonly specimen: StyleSpecimen;
  readonly regionId: RegionId;
  readonly values: LayoutValues;
  readonly arrangement: LayoutArrangement;
}): ReactNode {
  const { examples, description, specimen, regionId, values, arrangement } =
    props;
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
            {/* `inert`, the same rule `PresetCard`'s miniature already
              follows: an example draws the REAL leaf, and for Model that leaf
              is `HarnessModelTrigger` - a genuine `<button>` nested inside a
              `role="radio"`, which is invalid markup and reads to a screen
              reader as two overlapping controls (P-8, P-9). `inert` takes the
              picture out of focus, hit testing and the a11y tree in one, which
              leaves this radio as the row's one control. */}
            <span inert className="min-w-0 flex-1 overflow-hidden">
              {drawExample(
                specimen,
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

/**
 * One example's picture: the whole region, or the one specimen segment the
 * region's own grammar names instead (I-06).
 *
 * `depictUsageProvider` is the same framed segment the provider level puts on
 * its stage, so the example row and that level draw identical pixels.
 */
function drawExample(
  specimen: StyleSpecimen,
  regionId: RegionId,
  values: LayoutValues,
  arrangement: LayoutArrangement,
): ReactNode {
  if (specimen === "region") {
    return regionDepiction(regionId, values, arrangement);
  }
  return depictUsageProvider(
    specimenProvider(arrangement),
    values.usageLimits,
    arrangement,
    // The specimen's own window, not live ones: a Style example is a picture
    // of the READING SHAPE, and the same shape has to be comparable between
    // the five rows. Only the provider level draws from live windows, because
    // there the windows are what is being picked (L-96).
    null,
  );
}

/**
 * The provider a usage example is drawn from: the first one the strip actually
 * shows, so the example matches what the user is looking at, and the first
 * configured provider when they have hidden them all.
 */
function specimenProvider(arrangement: LayoutArrangement): RateLimitProviderId {
  return (
    arrangement.usageProviders.find(
      (providerId) => !arrangement.hiddenProviders.includes(providerId),
    ) ??
    arrangement.usageProviders.at(0) ??
    USAGE_PROVIDER_IDS[0]
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
 * a control's key that way: merging one branch of a twenty-three-branch union
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
