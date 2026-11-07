import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  ValidateBy,
} from 'class-validator';

import { defineMessage, rule } from '../../../i18n/validation';
import { HOME_KINDS, type HomeKind } from '../home-kinds';

/**
 * Each hidden kind is also placed in `order`, where Show puts it back.
 * Either part that is no list is left to its own rules, so its refusal is
 * the one said.
 */
const IsPlaced = () =>
  ValidateBy({
    name: 'isPlaced',
    validator: {
      validate: (hidden: unknown, args) => {
        const { order } = (args?.object ?? {}) as Partial<HomeLayoutDto>;
        return (
          !Array.isArray(order) ||
          !Array.isArray(hidden) ||
          hidden.every((kind: HomeKind) => order.includes(kind))
        );
      },
      defaultMessage: rule(
        defineMessage({
          id: 'validation.hiddenNotPlaced',
          defaultMessage:
            'Each kind in {property} must also be in order — send the hidden ones in their place there too',
        }),
      ),
    },
  });

/**
 * Customise Home's Done (ADR-091, amended November 2026): every kind the
 * person arranged, the hidden ones included, in their order; which are
 * hidden; and whether Recently opened shows. A kind this build does not
 * know, or one twice, is refused. A kind the member may not see today is
 * kept, since their roles may change; Home skips it until then. A kind
 * stored that this one does not name, as Home never sends a kind the
 * member may not see, is kept too, after the rest.
 */
export class HomeLayoutDto {
  @IsArray()
  @ArrayMaxSize(HOME_KINDS.length)
  @ArrayUnique()
  @IsIn(HOME_KINDS, { each: true })
  order!: HomeKind[];

  @IsArray()
  @ArrayMaxSize(HOME_KINDS.length)
  @ArrayUnique()
  @IsIn(HOME_KINDS, { each: true })
  @IsPlaced()
  hidden!: HomeKind[];

  /** Whether Recently opened shows on Home. */
  @IsBoolean()
  recent!: boolean;
}
