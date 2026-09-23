import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, desc, eq, sql } from 'drizzle-orm';

import { recordContext } from '../../core/audit/audit-context';
import {
  isForeignKeyViolation,
  isUniqueViolation,
} from '../../database/errors';
import { bomLines, boms, productionOrders } from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import { ProductLicencesService } from '../product-licences/product-licences.service';
import type { CreateBomDto } from './dto/create-bom.dto';
import type { CreateBomLineDto } from './dto/create-bom-line.dto';
import type { ListBomsDto } from './dto/list-boms.dto';
import type { UpdateBomDto } from './dto/update-bom.dto';
import type { UpdateBomLineDto } from './dto/update-bom-line.dto';

type Tx = Parameters<Parameters<TenantDb['transaction']>[0]>[0];

/**
 * The row type, named because it is the return type of create() and
 * duplicate(). Without it those infer through a transaction callback and an
 * insert builder, and one `any` anywhere in that chain silently becomes the
 * controller's return type.
 */
type Bom = typeof boms.$inferSelect;
type BomLine = typeof bomLines.$inferSelect;

/**
 * Recipes: what a variant is made of (ADR-029).
 *
 * Four rules live here rather than in the database, each because a check
 * constraint sees one row and these have to look across tables — the same
 * place the `tracks_lots` rule sits.
 *
 *   1. No cycles. Two individually valid lines can be wrong together.
 *   2. Versions are assigned at creation and statuses move in one direction.
 *   3. Only drafts are editable, so an active recipe cannot change under a
 *      run that has not been released yet.
 *   4. Promotion archives the outgoing version in the same transaction.
 */
@Injectable()
export class BomsService {
  private readonly logger = new Logger(BomsService.name);

  constructor(
    private readonly tenantDb: TenantDb,
    private readonly licences: ProductLicencesService,
  ) {}

  /**
   * The licence foreign key is global, like every id here: without this check
   * another organization's licence would be accepted by the database, and the
   * recall trail would point outside the tenant (ADR-003). The foreign-key
   * catch below still covers an id that exists nowhere at all.
   */
  private async assertLicenceWithin(licenceId: string | undefined) {
    if (!licenceId) return;

    if (!(await this.licences.existsWithin(licenceId))) {
      throw new BadRequestException('licenceId does not exist');
    }
  }

  list(query: ListBomsDto) {
    const filters = [
      query.outputVariantId
        ? eq(boms.outputVariantId, query.outputVariantId)
        : undefined,
      query.status ? eq(boms.status, query.status) : undefined,
    ].filter((f): f is NonNullable<typeof f> => f !== undefined);

    return this.tenantDb.select(
      boms,
      filters.length > 0 ? and(...filters) : undefined,
      // Newest version first: the one people mean is almost always the latest.
      { orderBy: [desc(boms.outputVariantId), desc(boms.version)] },
    );
  }

  async findById(bomId: string) {
    const [bom] = await this.tenantDb.select(boms, eq(boms.id, bomId));

    if (!bom) throw new NotFoundException('No such BOM');

    return bom;
  }

  /**
   * A recipe with its lines. Two queries rather than a join, as the partner
   * detail read does: one header and its children do not need de-duplicating
   * in JS.
   *
   * Lines come back in insertion order, which is free — UUIDv7 ids sort by
   * creation time (ADR-010), so no sequence column exists or is needed.
   */
  async findDetail(bomId: string) {
    const bom = await this.findById(bomId);

    const [lines, used] = await Promise.all([
      this.tenantDb.select(bomLines, eq(bomLines.bomId, bomId), {
        orderBy: [asc(bomLines.id)],
      }),
      this.usedByARun(bomId),
    ]);

    /**
     * `licenceLocked` answers the one question the recipe panel cannot work
     * out for itself: whether the number can still be attached (ADR-029). A
     * draft is always editable; an active recipe stays editable only until a
     * run is planned against it.
     */
    return { ...bom, lines, licenceLocked: bom.status !== 'draft' && used };
  }

  /**
   * Header and lines together, in one transaction.
   *
   * The version is assigned here rather than at promotion: a draft that will
   * become version 4 should say so while it is being written, and the unique
   * index on (organization, output, version) is what makes two people drafting
   * at once fail loudly instead of silently colliding later.
   */
  async create(input: CreateBomDto): Promise<Bom> {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      const version = await this.nextVersion(
        tx,
        organizationId,
        input.outputVariantId,
      );

      for (const line of input.lines ?? []) {
        await this.assertNoCycle(
          tx,
          organizationId,
          input.outputVariantId,
          line.componentVariantId,
        );
      }

      await this.assertLicenceWithin(input.licenceId);

      const bom = await this.insertHeader(tx, {
        organizationId,
        outputVariantId: input.outputVariantId,
        outputQuantity: input.outputQuantity,
        licenceId: input.licenceId,
        notes: input.notes,
        version,
        status: 'draft',
      });

      await this.insertLines(tx, organizationId, bom.id, input.lines ?? []);

      this.logger.log(
        `BOM ${bom.id} created as version ${version} for variant ${input.outputVariantId}`,
      );

      return bom;
    });
  }

  async update(bomId: string, input: UpdateBomDto) {
    const bom = await this.findById(bomId);

    await this.assertEditable(bom, input);
    await this.assertLicenceWithin(input.licenceId);

    // The number, not the id: History should read "80012345 (Health
    // Canada)". Unchanged on both sides means the interceptor skips the row.
    if (input.licenceId !== undefined) {
      recordContext({
        licence: {
          from: await this.licences.labelOf(bom.licenceId),
          to: await this.licences.labelOf(input.licenceId),
        },
      });
    }

    try {
      await this.tenantDb.update(boms, input, eq(boms.id, bomId));
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw new BadRequestException('licenceId does not exist');
      }
      throw error;
    }

    this.logger.log(`BOM ${bomId} updated`);
  }

  /**
   * A promoted recipe is frozen, with one exception: the licence, and only
   * while nothing has been made against it.
   *
   * The case is ordinary for a natural health product. You promote a recipe,
   * the application goes in, and the NPN lands six weeks later. Without this
   * the only way to record it is a new version identical to the last but for
   * a number, which puts a fiction in the version history — the formulation
   * never changed.
   *
   * It locks the moment a run references the recipe, because from then on the
   * licence is a claim about what a finished batch was made under, and
   * changing it would rewrite that. Archived recipes never reopen: the
   * question there is what was true, not what is.
   */
  private async assertEditable(bom: Bom, input: UpdateBomDto): Promise<void> {
    if (bom.status === 'draft') return;

    /**
     * Keys actually sent. A validated DTO carries every declared property,
     * the unsent ones as undefined, so counting keys alone reads a
     * licence-only PATCH as an attempt to rewrite the whole recipe. Clearing
     * the licence sends null, which counts as sent.
     */
    const sent = Object.entries(input)
      .filter(([, value]) => value !== undefined)
      .map(([key]) => key);

    const onlyLicence = sent.length === 1 && sent[0] === 'licenceId';

    if (!onlyLicence || bom.status !== 'active') {
      this.assertDraft(bom.status, 'edited');
    }

    if (await this.usedByARun(bom.id)) {
      throw new ConflictException(
        'A run has been made against this recipe, so its licence is fixed — draft a new version instead',
      );
    }
  }

  /** Whether any production run points at this recipe, in any state. */
  private async usedByARun(bomId: string): Promise<boolean> {
    const [run] = await this.tenantDb.select(
      productionOrders,
      eq(productionOrders.bomId, bomId),
      { limit: 1 },
    );

    return !!run;
  }

  async addLine(bomId: string, input: CreateBomLineDto): Promise<BomLine> {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      const bom = await this.loadWithin(tx, organizationId, bomId);

      this.assertDraft(bom.status, 'edited');

      await this.assertNoCycle(
        tx,
        organizationId,
        bom.outputVariantId,
        input.componentVariantId,
      );

      const [line] = await this.insertLines(tx, organizationId, bomId, [input]);

      this.logger.log(`BOM ${bomId} gained line ${line.id}`);
      return line;
    });
  }

  async updateLine(bomId: string, lineId: string, input: UpdateBomLineDto) {
    const bom = await this.findById(bomId);

    this.assertDraft(bom.status, 'edited');

    const [line] = await this.tenantDb.select(
      bomLines,
      and(eq(bomLines.id, lineId), eq(bomLines.bomId, bomId)),
    );

    if (!line) throw new NotFoundException('No such line on this BOM');

    /**
     * No cycle check. componentVariantId is not editable (see
     * UpdateBomLineDto), so nothing here can change what the recipe reaches.
     */
    await this.tenantDb.update(bomLines, input, eq(bomLines.id, lineId));

    this.logger.log(`BOM ${bomId} line ${lineId} updated`);
  }

  async removeLine(bomId: string, lineId: string) {
    const bom = await this.findById(bomId);

    this.assertDraft(bom.status, 'edited');

    const [line] = await this.tenantDb.select(
      bomLines,
      and(eq(bomLines.id, lineId), eq(bomLines.bomId, bomId)),
    );

    if (!line) throw new NotFoundException('No such line on this BOM');

    await this.tenantDb.delete(bomLines, eq(bomLines.id, lineId));

    this.logger.log(`BOM ${bomId} line ${lineId} removed`);
  }

  /**
   * draft → active, archiving whatever was active for the same output.
   *
   * Both writes are in one transaction and in this order, because
   * `boms_one_active_per_output_key` is a partial unique index: activating
   * first would collide with the outgoing version rather than replacing it.
   * The index is doing real work here — without it a second active row is
   * writable and the picker would choose between two recipes silently.
   */
  async promote(bomId: string) {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      const bom = await this.loadWithin(tx, organizationId, bomId);

      if (bom.status !== 'draft') {
        throw new ConflictException(
          `A ${bom.status} BOM cannot be promoted — create a new version instead`,
        );
      }

      const lines = await tx
        .select({ id: bomLines.id })
        .from(bomLines)
        .where(eq(bomLines.bomId, bomId));

      /**
       * A recipe with no components would produce output from nothing, and a
       * run against it would write a production movement with no consumption
       * — stock appearing with no explanation, which is the one thing the
       * ledger exists to prevent (ADR-023).
       */
      if (lines.length === 0) {
        throw new ConflictException('A BOM with no lines cannot be promoted');
      }

      await tx
        .update(boms)
        .set({ status: 'archived' })
        .where(
          and(
            eq(boms.organizationId, organizationId),
            eq(boms.outputVariantId, bom.outputVariantId),
            eq(boms.status, 'active'),
          ),
        );

      await tx.update(boms).set({ status: 'active' }).where(eq(boms.id, bomId));

      this.logger.log(`BOM ${bomId} promoted to active`);
    });
  }

  /**
   * active → archived. One direction only: an archived recipe is what some
   * past run was made under, and reviving it would make the version sequence
   * lie about which was current when. A new version is how a recipe comes
   * back.
   */
  async archive(bomId: string) {
    const bom = await this.findById(bomId);

    if (bom.status === 'archived') {
      throw new ConflictException('This BOM is already archived');
    }

    await this.tenantDb.update(
      boms,
      { status: 'archived' },
      eq(boms.id, bomId),
    );

    this.logger.log(`BOM ${bomId} archived`);
  }

  /**
   * Copies a recipe into a new draft at the next version.
   *
   * This is how an active recipe is changed: not by editing it, which would
   * alter what an unreleased run is about to consume, but by drafting the
   * successor and promoting it. Same rule as ADR-031 — nothing frozen is
   * copied forward, and the new draft starts its own life.
   */
  async duplicate(bomId: string): Promise<Bom> {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      const source = await this.loadWithin(tx, organizationId, bomId);

      const version = await this.nextVersion(
        tx,
        organizationId,
        source.outputVariantId,
      );

      const bom = await this.insertHeader(tx, {
        organizationId,
        outputVariantId: source.outputVariantId,
        outputQuantity: source.outputQuantity,
        licenceId: source.licenceId,
        notes: source.notes,
        version,
        status: 'draft',
      });

      const sourceLines = await tx
        .select()
        .from(bomLines)
        .where(eq(bomLines.bomId, bomId))
        .orderBy(asc(bomLines.id));

      if (sourceLines.length > 0) {
        await tx.insert(bomLines).values(
          sourceLines.map((line) => ({
            organizationId,
            bomId: bom.id,
            componentVariantId: line.componentVariantId,
            quantity: line.quantity,
            supplyType: line.supplyType,
            notes: line.notes,
          })),
        );
      }

      this.logger.log(
        `BOM ${bomId} duplicated as ${bom.id}, version ${version}`,
      );

      return bom;
    });
  }

  // ---------------------------------------------------------------------------

  private assertDraft(status: string, verb: string): void {
    if (status !== 'draft') {
      throw new ConflictException(
        `A ${status} BOM cannot be ${verb} — duplicate it to a new draft instead`,
      );
    }
  }

  /**
   * The header insert, with its error mapping.
   *
   * A method rather than a try/catch inline, because assigning into a `let`
   * declared outside the try leaves it implicitly `any` — and that `any`
   * escapes through the transaction callback all the way to the controller's
   * response type. Returning from inside the try keeps inference intact.
   */
  private async insertHeader(
    tx: Tx,
    values: typeof boms.$inferInsert,
  ): Promise<Bom> {
    try {
      const [bom] = await tx.insert(boms).values(values).returning();
      return bom;
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw new BadRequestException(
          'outputVariantId or licenceId does not exist',
        );
      }
      if (isUniqueViolation(error)) {
        // Two drafts raced for the same version number.
        throw new ConflictException(
          'Another version of this recipe was created at the same time — try again',
        );
      }
      throw error;
    }
  }

  private async loadWithin(tx: Tx, organizationId: string, bomId: string) {
    const [bom] = await tx
      .select()
      .from(boms)
      .where(and(eq(boms.organizationId, organizationId), eq(boms.id, bomId)));

    if (!bom) throw new NotFoundException('No such BOM');

    return bom;
  }

  private async nextVersion(
    tx: Tx,
    organizationId: string,
    outputVariantId: string,
  ): Promise<number> {
    const [row] = await tx
      .select({ highest: sql<number>`coalesce(max(${boms.version}), 0)` })
      .from(boms)
      .where(
        and(
          eq(boms.organizationId, organizationId),
          eq(boms.outputVariantId, outputVariantId),
        ),
      );

    return Number(row?.highest ?? 0) + 1;
  }

  private async insertLines(
    tx: Tx,
    organizationId: string,
    bomId: string,
    lines: CreateBomLineDto[],
  ): Promise<BomLine[]> {
    if (lines.length === 0) return [];

    try {
      return await tx
        .insert(bomLines)
        .values(
          lines.map((line) => ({
            organizationId,
            bomId,
            componentVariantId: line.componentVariantId,
            quantity: line.quantity,
            supplyType: line.supplyType ?? 'stocked',
            notes: line.notes,
          })),
        )
        .returning();
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          'That component is already a line on this BOM — edit the quantity instead',
        );
      }
      if (isForeignKeyViolation(error)) {
        throw new BadRequestException('componentVariantId does not exist');
      }
      throw error;
    }
  }

  /**
   * Refuses a line whose component reaches this BOM's own output.
   *
   * Starts at the component and walks down through everything it consumes,
   * looking for the output. The base case includes the component itself, so a
   * line pointing a variant at its own recipe is caught by the same query.
   *
   * Every status is walked, not just active. A cycle drafted today is a cycle
   * the day it is promoted, and refusing it at write time is the only moment
   * anyone can see which line caused it.
   *
   * UNION rather than UNION ALL: the set is what matters, and the
   * de-duplication is also what terminates the walk if a cycle ever did get
   * into the data through some other path.
   *
   * A check constraint cannot express this — it sees one row, and a cycle is a
   * property of the graph.
   */
  private async assertNoCycle(
    tx: Tx,
    organizationId: string,
    outputVariantId: string,
    componentVariantId: string,
  ): Promise<void> {
    const found = await tx.execute(sql`
      with recursive reachable(variant_id) as (
        select ${componentVariantId}::uuid
        union
        select bl.component_variant_id
        from reachable r
        join boms b
          on b.output_variant_id = r.variant_id
         and b.organization_id = ${organizationId}::uuid
        join bom_lines bl
          on bl.bom_id = b.id
      )
      select 1 from reachable where variant_id = ${outputVariantId}::uuid limit 1
    `);

    if (found.rows.length > 0) {
      throw new ConflictException(
        'That component is made from this product, directly or through another recipe — adding it would make a cycle',
      );
    }
  }
}
