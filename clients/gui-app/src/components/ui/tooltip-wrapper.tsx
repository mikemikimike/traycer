import * as React from "react";
import { useRender } from "@base-ui/react/use-render";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface TooltipWrapperProps {
  readonly children: React.ReactNode;
  readonly ref?: React.Ref<HTMLElement>;
  readonly label: React.ReactNode;
  readonly side: "top" | "right" | "bottom" | "left";
  readonly sideOffset: number | undefined;
  readonly align: "start" | "center" | "end" | undefined;
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  /**
   * Element the tooltip must stay inside, normally the surrounding
   * `[data-slot="dialog-content"]`.
   *
   * Radix defaults to the viewport, which is right for a tooltip on the page
   * but wrong inside a modal: the label happily renders past the dialog's edge
   * and reads as a rendering bug. Settings controls already resolve the same
   * boundary for their popovers (`theme-preset-picker`, `font-picker`,
   * `shell-program-combobox`); this is that pattern for tooltips.
   */
  readonly collisionBoundary?: Element | null;
  readonly collisionPadding?: number;
}

// Transparent wrapper: when `label` is empty/null, renders its child directly so
// any props/ref injected by an outer `asChild` trigger (e.g.
// `DropdownMenuTrigger asChild`) flow through to the inner child. Otherwise
// renders the tooltip stack with the same forwarding via
// `TooltipTrigger asChild`.
//
// We deliberately keep `TooltipWrapperProps` narrow at the call-site, but the
// runtime `props` object also carries whatever `React.cloneElement` injects
// when this component is the immediate child of an outer `asChild` slot
// (`onClick`, `onPointerDown`, `ref`, etc.). The rest-spread forwards those
// to the rendered child/TooltipTrigger so they reach the real interactive element.
export function TooltipWrapper(props: TooltipWrapperProps) {
  const {
    children,
    ref,
    label,
    side,
    sideOffset,
    align,
    open,
    onOpenChange,
    collisionBoundary,
    collisionPadding,
    ...rest
  } = props;
  // `undefined` degrades exactly like `null`. It used to fall through and
  // render an empty tooltip box, which is never what a caller means - and the
  // shape that produces it (`someReason ?? undefined`, left over from the
  // native `title` attribute this component replaces) is the single most
  // common way to call it.
  const emptyLabel =
    label === null ||
    label === undefined ||
    (typeof label === "string" && label.length === 0);
  const child = useRender({
    render: React.isValidElement(children) ? children : undefined,
    ref,
    props: emptyLabel ? rest : {},
    enabled: React.isValidElement(children),
  });
  if (emptyLabel) return child;
  return (
    <Tooltip open={open} onOpenChange={onOpenChange}>
      <TooltipTrigger asChild {...rest}>
        {child}
      </TooltipTrigger>
      <TooltipContent
        side={side}
        sideOffset={sideOffset}
        align={align}
        collisionBoundary={collisionBoundary ?? undefined}
        collisionPadding={collisionPadding}
      >
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
