/** Sonner remains a separate interaction branch during the Base migration. */
export function isToastEvent(details: {
  reason: string;
  event: Event;
}): boolean {
  const inToaster = (target: EventTarget | null): boolean =>
    target instanceof Element &&
    target.closest("[data-sonner-toaster]") !== null;
  if (details.reason === "focus-out")
    return (
      details.event instanceof FocusEvent &&
      inToaster(details.event.relatedTarget)
    );
  return (
    details.reason === "outside-press" &&
    (inToaster(details.event.target) ||
      details.event.composedPath().some(inToaster))
  );
}
