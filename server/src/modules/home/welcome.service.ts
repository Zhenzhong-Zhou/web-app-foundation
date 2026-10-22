import { Injectable } from '@nestjs/common';
import { and, eq, type SQL, sql } from 'drizzle-orm';

import { addDays, dayIn, todayIn } from '../../common/today';
import { AUDIT_ACTIONS } from '../../core/audit/audit-actions';
import type { RequestContext } from '../../core/auth/request-context';
import type { MemberRole } from '../../core/authorization/dto/member-access-response.dto';
import {
  MemberAccessService,
  memberRole,
} from '../../core/authorization/member-access.service';
import { rolesOfMember } from '../../core/authorization/member-roles';
import type { Permission } from '../../core/authorization/permissions';
import { inviterStillHere } from '../../core/invitations/inviter';
import type { Transaction } from '../../database/database.module';
import {
  invitations,
  memberships,
  organizations,
  productVariants,
  type RecentKind,
  stockMovements,
  users,
} from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import { kindsVisibleWith, RecentService } from '../recent/recent.service';
import type {
  Welcome,
  WelcomeDone,
  WelcomeItem,
} from './dto/home-response.dto';

/**
 * How long the welcome shows: from the day the membership began until
 * fourteen days later, that day included (ADR-079), as "until 3 November"
 * says it.
 */
export const WELCOME_DAYS = 14;

/** The first week's items (ADR-079), each worded and linked by the client. */
export type WelcomeItemKey =
  'confirmEmail' | 'sayWhoYouAre' | 'lookUp' | 'openOrder' | Act;

/** The five that change something (ADR-079). */
type Act =
  'receiveStock' | 'raiseOrder' | 'shipOrder' | 'planRun' | 'draftInvoice';

/** The records the first week touches, by Recently opened's kinds (ADR-058). */
type DoneRecord = Extract<
  RecentKind,
  'product' | 'lot' | 'order' | 'run' | 'invoice'
>;

/**
 * What a done item says was done: a record, which it opens; or the
 * person's own address, photo or job title, which open Account.
 */
export type WelcomeDoneKind = 'email' | 'photo' | 'jobTitle' | DoneRecord;

/**
 * After the lookup, the first three of these the person may do are their
 * work for the week, in this order (ADR-079).
 */
const WORK: {
  key: 'lookUp' | Act;
  may: (held: ReadonlySet<Permission>) => boolean;
}[] = [
  {
    key: 'lookUp',
    may: (held) => held.has('products.view') || held.has('stock.view'),
  },
  // Against an order too (ADR-080): its button then opens the confirmed
  // purchases, for someone who may not move stock otherwise.
  {
    key: 'receiveStock',
    may: (held) => held.has('stock.move') || held.has('orders.receive'),
  },
  { key: 'raiseOrder', may: (held) => held.has('orders.create') },
  { key: 'shipOrder', may: (held) => held.has('orders.ship') },
  { key: 'planRun', may: (held) => held.has('production.create') },
  { key: 'draftInvoice', may: (held) => held.has('invoices.create') },
];

/**
 * Each act's own entry in the audit log (ADR-018). Receiving is either
 * against an order or a movement on its own, whose reason the entry keeps.
 * Over `a`, the audit log as acts() names it.
 */
const ACTS: Record<Act, SQL> = {
  receiveStock: sql`(a.action = ${AUDIT_ACTIONS.ORDER_LINE_RECEIVED}
    or (a.action = ${AUDIT_ACTIONS.STOCK_MOVEMENT_RECORDED}
        and a.payload->>'reason' = 'receipt'))`,
  raiseOrder: sql`a.action = ${AUDIT_ACTIONS.ORDER_CREATED}`,
  shipOrder: sql`a.action = ${AUDIT_ACTIONS.ORDER_SHIPPED}`,
  planRun: sql`a.action = ${AUDIT_ACTIONS.PRODUCTION_ORDER_CREATED}`,
  draftInvoice: sql`a.action = ${AUDIT_ACTIONS.INVOICE_CREATED}`,
};

const isAct = (key: WelcomeItemKey): key is Act => key in ACTS;

/**
 * The latest entry for each act, as acts() reads it: each act's route
 * names its resource (ADR-018).
 */
type ActRow = {
  item: Act;
  resourceType: 'order' | 'production_order' | 'invoice' | 'stock_movement';
  resourceId: string;
};

/** An act's resource as Recently opened knows its kind. */
const KIND_OF: Record<
  Exclude<ActRow['resourceType'], 'stock_movement'>,
  DoneRecord
> = {
  order: 'order',
  production_order: 'run',
  invoice: 'invoice',
};

/** The facts about the reader's membership the welcome starts from. */
interface Membership {
  id: string;
  createdAt: Date;
  dismissedAt: Date | null;
  jobTitle: string | null;
  photoFileId: string | null;
  emailVerifiedAt: Date | null;
  founder: boolean;
  roles: MemberRole[];
}

/**
 * The welcome on Home (ADR-079): the member's own card, for two weeks from
 * joining, with the inviter's note, what they may do here and their first
 * week, each item chosen from their permissions and ticked by what they
 * have done here since joining, never by hand.
 *
 * A member past their two weeks, or who dismissed it, costs Home one read
 * of their membership; the rest is read only while the card shows, the
 * items, the inviter and whom to ask side by side.
 */
@Injectable()
export class WelcomeService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly recent: RecentService,
    private readonly access: MemberAccessService,
  ) {}

  /**
   * The card, or null once dismissed, past its last day, or with every
   * item done. `startShows` while Getting started is on Home, whose steps
   * are then this member's list, so the week keeps only their own two.
   */
  async of(
    context: Pick<RequestContext, 'userId' | 'organizationId'>,
    held: ReadonlySet<Permission>,
    options: { timeZone: string; startShows: boolean },
  ): Promise<Welcome | null> {
    const membership = await this.membership(context.userId);
    if (!membership || membership.dismissedAt) return null;

    const joinedOn = dayIn(options.timeZone, membership.createdAt);
    const lastDay = addDays(joinedOn, WELCOME_DAYS);
    if (todayIn(options.timeZone) > lastDay) return null;

    const [items, inviter, access] = await Promise.all([
      this.items(
        context.userId,
        membership,
        chosen(held, membership, options.startShows),
        held,
      ),
      this.inviter(membership.id),
      this.access.given(context, membership.roles, held),
    ]);
    if (items.every((item) => item.done)) return null;

    return {
      joinedOn,
      lastDay,
      founder: membership.founder,
      ...inviter,
      access,
      items,
    };
  }

  /** Dismiss, for this membership alone; Undo brings it back. */
  async setDismissed(userId: string, dismissed: boolean): Promise<void> {
    await this.tenantDb.update(
      memberships,
      { welcomeDismissedAt: dismissed ? new Date() : null },
      eq(memberships.userId, userId),
    );
  }

  /**
   * The reader's membership, and whether they started the organization, by
   * registering, an organization invitation or Start an organization
   * (ADR-078): the membership made in the same transaction as the
   * organization, by startOrganization, so both rows began at that
   * transaction's now(). Not the organization's oldest membership, which
   * passes to the next member when the founder leaves; and not "no
   * invitation behind it", which the demo seed's colleagues also have.
   */
  private membership(userId: string): Promise<Membership | undefined> {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      const [row] = await tx
        .select({
          id: memberships.id,
          createdAt: memberships.createdAt,
          dismissedAt: memberships.welcomeDismissedAt,
          jobTitle: memberships.jobTitle,
          photoFileId: users.photoFileId,
          emailVerifiedAt: users.emailVerifiedAt,
          founder: sql<boolean>`${memberships.createdAt} = ${organizations.createdAt}`,
        })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .innerJoin(
          organizations,
          eq(organizations.id, memberships.organizationId),
        )
        .where(
          and(
            eq(memberships.organizationId, organizationId),
            eq(memberships.userId, userId),
          ),
        );
      if (!row) return undefined;

      const held = await rolesOfMember(tx, row.id);
      return { ...row, roles: held.map(memberRole) };
    });
  }

  /**
   * The inviter and their note, from the invitation that made this
   * membership (ADR-077 keeps it for this). The inviter only while still a
   * member here; the note stays, from the organization, once they are not.
   * Neither for a membership no invitation made.
   */
  private inviter(
    membershipId: string,
  ): Promise<Pick<Welcome, 'inviter' | 'note'>> {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      const [row] = await tx
        .select({
          note: invitations.note,
          inviterId: users.id,
          inviterName: users.name,
          inviterPhoto: users.photoFileId,
        })
        .from(invitations)
        .leftJoin(memberships, inviterStillHere)
        .leftJoin(users, eq(users.id, memberships.userId))
        .where(
          and(
            eq(invitations.organizationId, organizationId),
            eq(invitations.membershipId, membershipId),
          ),
        );
      return {
        inviter:
          row?.inviterId && row.inviterName
            ? {
                id: row.inviterId,
                name: row.inviterName,
                photoFileId: row.inviterPhoto,
              }
            : null,
        note: row?.note ?? null,
      };
    });
  }

  /** Each chosen item, done or not, and when done, what was done. */
  private async items(
    userId: string,
    membership: Membership,
    keys: WelcomeItemKey[],
    held: ReadonlySet<Permission>,
  ): Promise<WelcomeItem[]> {
    const acts = this.acts(userId, membership.createdAt, keys.filter(isAct));

    return Promise.all(
      keys.map(async (key) => {
        const what = isAct(key)
          ? ((await acts).get(key) ?? null)
          : await this.own(userId, key, membership, held);
        return { key, done: what !== null, what };
      }),
    );
  }

  /**
   * What the person did to tick one of their own items, or null: their
   * address confirmed; a photo or this membership's job title; a product
   * or lot opened, or an order, as Recently opened records it (ADR-058).
   */
  private async own(
    userId: string,
    key: Exclude<WelcomeItemKey, Act>,
    membership: Membership,
    held: ReadonlySet<Permission>,
  ): Promise<WelcomeDone | null> {
    switch (key) {
      case 'confirmEmail':
        return membership.emailVerifiedAt
          ? { kind: 'email', id: null, words: null }
          : null;
      case 'sayWhoYouAre':
        if (membership.photoFileId)
          return { kind: 'photo', id: null, words: null };
        return membership.jobTitle?.trim()
          ? { kind: 'jobTitle', id: null, words: null }
          : null;
      case 'lookUp':
      case 'openOrder': {
        // Recently opened, of the kinds this item is about and the person
        // may still see: products and lots, or orders.
        const about: RecentKind[] =
          key === 'lookUp' ? ['product', 'lot'] : ['order'];
        const [entry] = await this.recent.list(
          userId,
          kindsVisibleWith(held).filter((kind) => about.includes(kind)),
          1,
        );
        return entry
          ? {
              kind: entry.kind as DoneRecord,
              id: entry.id,
              words: entry.title,
            }
          : null;
      }
    }
  }

  /**
   * The person's latest audit entry for each act asked, here and since
   * joining, by the actor's index (ADR-018), each named as it is now.
   */
  private acts(
    userId: string,
    since: Date,
    wanted: Act[],
  ): Promise<Map<Act, WelcomeDone>> {
    if (wanted.length === 0)
      return Promise.resolve(new Map<Act, WelcomeDone>());

    return this.tenantDb.transaction(async (tx, organizationId) => {
      const item = sql.join(
        wanted.map((act) => sql`when ${ACTS[act]} then ${act}::text`),
        sql` `,
      );
      const any = sql.join(
        wanted.map((act) => sql`(${ACTS[act]})`),
        sql` or `,
      );
      const result = await tx.execute<ActRow>(sql`
        select distinct on (item)
          item, resource_type as "resourceType", resource_id as "resourceId"
        from (
          select a.created_at, a.resource_type, a.resource_id,
                 case ${item} end as item
          from audit_log a
          where a.actor_id = ${userId}::uuid
            and a.organization_id = ${organizationId}::uuid
            and a.created_at >= ${since.toISOString()}::timestamptz
            and (${any})
        ) acts
        order by item, created_at desc
      `);

      const done = new Map<Act, WelcomeDone>();
      for (const row of result.rows) {
        done.set(row.item, await this.named(tx, organizationId, row));
      }
      return done;
    });
  }

  /**
   * An act's record, named as Recently opened names it: an order by its
   * number, a run by its reference, a draft invoice by its customer. A
   * receipt on its own opens its lot, or its product where it has none.
   * Done all the same once the record is gone, with nothing to open.
   */
  private async named(
    tx: Transaction,
    organizationId: string,
    row: ActRow,
  ): Promise<WelcomeDone> {
    let kind: DoneRecord;
    let id = row.resourceId;
    if (row.resourceType === 'stock_movement') {
      const [movement] = await tx
        .select({
          lotId: stockMovements.lotId,
          productId: productVariants.productId,
        })
        .from(stockMovements)
        .innerJoin(
          productVariants,
          eq(productVariants.id, stockMovements.variantId),
        )
        .where(
          and(
            eq(stockMovements.organizationId, organizationId),
            eq(stockMovements.id, id),
          ),
        );
      kind = movement?.lotId ? 'lot' : 'product';
      id = movement?.lotId ?? movement?.productId ?? id;
    } else {
      kind = KIND_OF[row.resourceType];
    }

    const [record] = await this.recent.named(tx, organizationId, kind, [id]);
    return record
      ? { kind, id: record.id, words: record.title ?? record.detail }
      : { kind, id: null, words: null };
  }
}

/**
 * The items for this member, in the card's order (ADR-079): Confirm your
 * email address for whoever joined unconfirmed, then Say who you are; then,
 * unless Getting started is the list, the first three of their work, with
 * Open an order after the lookup for someone who may do none of the five.
 */
function chosen(
  held: ReadonlySet<Permission>,
  membership: Membership,
  startShows: boolean,
): WelcomeItemKey[] {
  const unconfirmed =
    !membership.emailVerifiedAt ||
    membership.emailVerifiedAt > membership.createdAt;
  const own: WelcomeItemKey[] = [
    ...(unconfirmed ? (['confirmEmail'] as const) : []),
    'sayWhoYouAre',
  ];
  if (startShows) return own;

  const work: WelcomeItemKey[] = WORK.filter(({ may }) => may(held))
    .map(({ key }) => key)
    .slice(0, 3);
  if (!work.some(isAct) && held.has('orders.view')) work.push('openOrder');
  return [...own, ...work];
}
