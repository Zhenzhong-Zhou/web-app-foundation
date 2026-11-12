import { afterEach, describe, expect, it } from 'vitest';

import { ENGLISH, loadMessages } from '../i18n/catalogues';
import { makeIntl, setIntl } from '../i18n/intl';
import { articleOf, roleDescription, roleLabel, roleList } from './role-names';

describe('role names', () => {
  afterEach(() => setIntl(makeIntl('en', ENGLISH)));

  it('says a built-in role in the reader’s language, and a made one as named', () => {
    expect(roleLabel('Viewer')).toBe('Viewer');
    expect(roleLabel('Warehouse lead')).toBe('Warehouse lead');
    expect(roleList([{ name: 'Admin' }, { name: 'Sales' }])).toBe(
      'Admin and Sales',
    );
  });

  // ADR-090's space beside Latin letters, never beside Chinese (#501).
  it('spaces a made role’s Latin name from 和 in Chinese', async () => {
    setIntl(makeIntl('zh-Hans', await loadMessages('zh-Hans')));

    expect(roleList([{ name: 'Admin' }, { name: 'Warehouse lead' }])).toBe(
      '管理员和 Warehouse lead',
    );
    expect(roleList([{ name: 'Warehouse' }, { name: 'Sales' }])).toBe(
      'Warehouse 和 Sales',
    );
    expect(roleList([{ name: '仓库' }, { name: '销售' }])).toBe('仓库和销售');
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
