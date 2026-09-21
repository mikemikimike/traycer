import { useTabsStore } from "@/stores/tabs/store";
import { tabRefKey } from "@/stores/tabs/layout";
import type { HeaderTab } from "@/stores/tabs/types";

/**
 * The tab as the strip paints it: what the user chose for it, over what its
 * kind ships.
 *
 * Three tiers, and the order is the whole of it. A group's colour wins,
 * because joining a group is the later and more deliberate choice; then the
 * tab's own customization; then the appearance the KIND was built with. That
 * last tier is what the sample workspace's amber cap rides on (L-87) - it is
 * a fact about the tab kind rather than something a user picked, and a hook
 * that overwrote it would leave the kind's field silently dead.
 */
export function useHeaderTabAppearance(
  tab: HeaderTab | null,
): HeaderTab | null {
  const customization = useTabsStore((state) =>
    tab === null ? undefined : state.customizations?.[tabRefKey(tab)],
  );
  const groupId = customization?.groupId ?? null;
  const group = useTabsStore((state) =>
    groupId === null ? undefined : state.groups?.[groupId],
  );
  return tab === null
    ? null
    : {
        ...tab,
        appearance: {
          color:
            group?.color ??
            customization?.color ??
            tab.appearance?.color ??
            null,
          icon: customization?.icon ?? tab.appearance?.icon ?? null,
        },
      };
}
