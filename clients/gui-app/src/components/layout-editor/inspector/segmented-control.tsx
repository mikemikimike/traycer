import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

export interface SegmentedControlOption {
  readonly value: string;
  readonly label: string;
}

interface SegmentedControlProps {
  readonly options: ReadonlyArray<SegmentedControlOption>;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly ariaLabel: string;
}

/**
 * The pick-one-of-a-few control the grammar's Position/Style/Fine-tune rows
 * share (L-08): `.seg` in the prototype. Built from `Button` rather than
 * `RadioGroup` because a radio's hidden native input has no home in a row
 * this narrow, and `Button`'s `aria-checked` state already paints the "on"
 * fill (`ui/button.tsx`'s `ON_STATE`).
 */
export function SegmentedControl(props: SegmentedControlProps): ReactNode {
  const { options, value, onChange, ariaLabel } = props;
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex items-center gap-0.5 rounded-md border border-border bg-card p-0.5"
    >
      {options.map((option) => {
        const on = option.value === value;
        return (
          <Button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={on}
            variant="muted"
            size="xs"
            onClick={() => {
              if (!on) onChange(option.value);
            }}
          >
            {option.label}
          </Button>
        );
      })}
    </div>
  );
}
