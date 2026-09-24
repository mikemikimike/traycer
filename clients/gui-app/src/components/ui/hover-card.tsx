"use client";

import { PreviewCard as PreviewCardPrimitive } from "@base-ui/react/preview-card";

import { HOVER_PREVIEW_SURFACE_CLASS } from "@/components/ui/hover-preview-surface";
import { cn } from "@/lib/utils";
import { usePortalConcealed } from "@/components/ui/portal-concealment-context";
import { useSafeAreaCollisionPadding } from "@/components/ui/safe-area-collision-padding";

function HoverCard(props: PreviewCardPrimitive.Root.Props) {
  return <PreviewCardPrimitive.Root {...props} />;
}

// Match label hover-in and leave time to reach the card's actions.
function HoverCardTrigger({
  delay = 500,
  closeDelay = 150,
  ...props
}: PreviewCardPrimitive.Trigger.Props) {
  return (
    <PreviewCardPrimitive.Trigger
      data-slot="hover-card-trigger"
      delay={delay}
      closeDelay={closeDelay}
      {...props}
    />
  );
}

type HoverCardContentProps = PreviewCardPrimitive.Popup.Props &
  Pick<
    PreviewCardPrimitive.Positioner.Props,
    | "align"
    | "alignOffset"
    | "side"
    | "sideOffset"
    | "collisionBoundary"
    | "collisionPadding"
  > & {
    /** Compact path disclosures share label-tooltip colors but allow actions. */
    readonly appearance?: "preview" | "tooltip";
  };

// Preview actions remain pointer-operable. Each must also have a keyboard
// reachable home outside the hover surface (folder rows, Epic history).
function HoverCardContent({
  className,
  appearance = "preview",
  side = "bottom",
  align = "start",
  alignOffset = 0,
  sideOffset = 4,
  collisionBoundary,
  collisionPadding,
  ...props
}: HoverCardContentProps) {
  const concealed = usePortalConcealed();
  const safeAreaInsets = useSafeAreaCollisionPadding();
  if (concealed) return null;
  return (
    <PreviewCardPrimitive.Portal>
      <PreviewCardPrimitive.Positioner
        data-slot="hover-card-positioner"
        className="isolate z-50"
        positionMethod="fixed"
        side={side}
        align={align}
        alignOffset={alignOffset}
        sideOffset={sideOffset}
        collisionBoundary={collisionBoundary}
        collisionPadding={collisionPadding ?? safeAreaInsets}
      >
        <PreviewCardPrimitive.Popup
          data-slot="hover-card-content"
          data-appearance={appearance}
          className={(state) =>
            cn(
              "z-50 origin-(--transform-origin) outline-hidden duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
              appearance === "tooltip"
                ? "rounded-md bg-foreground text-background shadow-sm"
                : HOVER_PREVIEW_SURFACE_CLASS,
              "max-w-safe-dvw",
              typeof className === "function" ? className(state) : className,
            )
          }
          {...props}
        />
      </PreviewCardPrimitive.Positioner>
    </PreviewCardPrimitive.Portal>
  );
}

export { HoverCard, HoverCardTrigger, HoverCardContent };
