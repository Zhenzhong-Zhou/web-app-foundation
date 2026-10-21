import { defineMessages, type MessageDescriptor } from 'react-intl';

import type { Permission } from '../auth/permissions';
import { ACCOUNT_ITEMS, NAV_GROUPS } from '../layout/navigation';
import { guideFor, type GuideName } from './guides';

const M = defineMessages({
  work: { id: 'help.group.work', defaultMessage: 'Work' },
  you: { id: 'help.group.you', defaultMessage: 'You' },
});

export interface GuideGroup {
  label: MessageDescriptor;
  guides: GuideName[];
}

/**
 * The guides for the pages the person can open, grouped as the rail is: the
 * work, the records, the settings, then their own account (ADR-079). Read
 * from the rail itself, so a page added there is listed here too.
 *
 * Licences has no place in the rail, so it follows Products, the page that
 * leads to it.
 */
export function guideGroups(can: (permission: Permission) => boolean) {
  const groups: GuideGroup[] = NAV_GROUPS.map((group, index) => {
    const guides: GuideName[] = [];
    const add = (name: GuideName | null) => {
      if (name && !guides.includes(name)) guides.push(name);
    };
    for (const item of group.items) {
      if (item.permission && !can(item.permission)) continue;
      add(guideFor(item.to));
      if (item.to === '/products' && can('product_licences.view')) {
        add('licences');
      }
    }
    // The first group's name is the landmark's, Main; here it is the work.
    return { label: index === 0 ? M.work : group.label, guides };
  });

  const own = ACCOUNT_ITEMS.map(({ to }) => guideFor(to)).filter(
    (name, index, all): name is GuideName =>
      name !== null && all.indexOf(name) === index,
  );
  groups.push({ label: M.you, guides: own });

  return groups.filter((group) => group.guides.length > 0);
}
