import { afterEach, describe, expect, it } from 'vitest';

import { ENGLISH, loadMessages } from '../i18n/catalogues';
import { intl, makeIntl, setIntl } from '../i18n/intl';
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

  // ADR-090: a built-in role, in Chinese words, meets the Chinese around
  // it with no space; a made one, as typed and maybe in Latin letters,
  // keeps one (#573), as the invitation email names it.
  it('spaces a made role from the Chinese beside it on the Invite dialog, and a built-in one not', async () => {
    setIntl(makeIntl('zh-Hans', await loadMessages('zh-Hans')));
    const as = (name: string) => ({
      roles: roleList([{ name }]),
      system: articleOf([{ name }]),
    });
    const member = (name: string) =>
      intl().formatMessage(
        {
          id: 'members.invite.alreadyMember',
          defaultMessage:
            '{name} is already a member here, as {system, select, Owner {an {roles}} Admin {an {roles}} Viewer {a {roles}} other {{roles}}}.',
        },
        { name: 'Mei Lin', ...as(name) },
      );
    const link = (name: string) =>
      intl().formatMessage(
        {
          id: 'members.invite.copied.works',
          defaultMessage:
            'It works once, until {date}. Send it only to them: whoever opens it first joins as {email}, {system, select, Owner {an {roles}} Admin {an {roles}} Viewer {a {roles}} other {{roles}}}.',
        },
        { date: '10月26日', email: 'mei@example.com', ...as(name) },
      );

    expect(member('Admin')).toBe('Mei Lin 已是本组织的成员，角色为管理员。');
    expect(member('Warehouse lead')).toBe(
      'Mei Lin 已是本组织的成员，角色为 Warehouse lead。',
    );
    expect(link('Viewer')).toMatch(/的身份加入，角色为查看者。$/);
    expect(link('Warehouse lead')).toMatch(
      /的身份加入，角色为 Warehouse lead。$/,
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
