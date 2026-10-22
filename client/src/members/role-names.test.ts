import { describe, expect, it } from 'vitest';

import { articleOf, roleDescription, roleLabel, roleList } from './role-names';

describe('role names', () => {
  it('says a built-in role in the reader’s language, and a made one as named', () => {
    expect(roleLabel('Viewer')).toBe('Viewer');
    expect(roleLabel('Warehouse lead')).toBe('Warehouse lead');
    expect(roleList([{ name: 'Admin' }, { name: 'Sales' }])).toBe(
      'Admin and Sales',
    );
  });

  // A made role may be named anything an object already has a key for.
  it('reads a role named after an object’s own keys as named', () => {
    for (const name of ['constructor', 'toString', '__proto__', 'valueOf']) {
      expect(roleLabel(name)).toBe(name);
      expect(articleOf([{ name }])).toBe('other');
      expect(roleDescription(name)).toBeNull();
    }
  });
});
