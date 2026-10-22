import { SUPPORTED_LOCALES } from '../../common/locales';
import { ROLE_NAMES } from '../../core/audit/audit-fields';
import {
  NEVER_OFFERED,
  PERMISSION_NEEDS,
} from '../../core/authorization/permissions';
import { translate } from '../../i18n/translate';
import { VOLUMES } from './scale';
import { MADE_ROLES, permissionsOf } from './write-team';

/**
 * The made roles only the large scale writes would otherwise first meet
 * RolesService's rules an hour into a seed (ADR-080, ADR-081).
 */
describe('the volume seed’s made roles', () => {
  it('has as many as each scale makes', () => {
    for (const [scale, volume] of Object.entries(VOLUMES)) {
      expect(MADE_ROLES.length, scale).toBeGreaterThanOrEqual(volume.madeRoles);
    }
  });

  it('names each once, ignoring case, and none as a built-in role in any language', () => {
    const builtIn = Object.values(ROLE_NAMES).flatMap((message) =>
      SUPPORTED_LOCALES.map((locale) =>
        translate(message, locale).toLocaleLowerCase(),
      ),
    );
    const names = MADE_ROLES.map((role) => role.name.toLocaleLowerCase());

    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(builtIn).not.toContain(name);
  });

  it.each(MADE_ROLES.map((role) => [role.name, role] as const))(
    'gives %s what each of its permissions needs, and nothing kept for Owners',
    (_, role) => {
      const granted = permissionsOf(role);

      for (const key of granted) {
        for (const need of PERMISSION_NEEDS[key] ?? []) {
          expect(granted, `${key} needs ${need}`).toContain(need);
        }
      }
      for (const kept of NEVER_OFFERED) expect(granted).not.toContain(kept);
    },
  );

  it('ticks only what its start lacks, and unticks only what it holds', () => {
    for (const role of MADE_ROLES) {
      const start = permissionsOf({ ...role, add: [], remove: [] });
      for (const key of role.add ?? []) {
        expect(start, role.name).not.toContain(key);
      }
      for (const key of role.remove ?? []) {
        expect(start, role.name).toContain(key);
      }
    }
  });
});
