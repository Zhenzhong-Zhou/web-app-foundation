import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';

import { isUniqueViolation } from '../../database/errors';
import { locations } from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import type { CreateLocationDto } from './dto/create-location.dto';
import type { UpdateLocationDto } from './dto/update-location.dto';

/** A tree this deep is a data-entry mistake, not a warehouse. */
const MAX_DEPTH = 10;

@Injectable()
export class LocationsService {
  private readonly logger = new Logger(LocationsService.name);

  constructor(private readonly tenantDb: TenantDb) {}

  /**
   * Flat, ordered by name. The client nests it.
   *
   * A recursive CTE would be the database-side answer and is not worth it at
   * tens of rows — and the client needs the flat list anyway, for the parent
   * picker on the create form.
   */
  list() {
    return this.tenantDb.select(locations, undefined, {
      orderBy: asc(locations.name),
    });
  }

  async create(input: CreateLocationDto) {
    if (input.parentId) {
      // Scoped, so a parent in another organization is simply not found.
      const [parent] = await this.tenantDb.select(
        locations,
        eq(locations.id, input.parentId),
      );

      if (!parent) throw new BadRequestException('Unknown parent location');

      // Checked on create as well as on reparent: a chain built downward can
      // exceed the limit without any single step looking wrong.
      await this.assertDepthAllows(input.parentId);
    }

    try {
      const [location] = await this.tenantDb
        .insert(locations, {
          type: input.type,
          name: input.name,
          code: input.code,
          parentId: input.parentId,
        })
        .returning();

      this.logger.log(`Location ${location.id} created`);
      return location;
    } catch (error) {
      if (isUniqueViolation(error)) {
        // Codes are unique within a parent, not globally: Bin 5 in two aisles
        // is two bins, and both labels reading "5" is normal.
        throw new ConflictException(
          `Code ${input.code} is already used in this location`,
        );
      }
      throw error;
    }
  }

  async update(locationId: string, input: UpdateLocationDto) {
    const [existing] = await this.tenantDb.select(
      locations,
      eq(locations.id, locationId),
    );

    if (!existing) throw new NotFoundException('No such location');

    if (input.parentId !== undefined && input.parentId !== existing.parentId) {
      if (input.parentId !== null) {
        const [parent] = await this.tenantDb.select(
          locations,
          eq(locations.id, input.parentId),
        );

        if (!parent) throw new BadRequestException('Unknown parent location');

        // The database's check constraint catches a location parented to
        // itself. A → B → A needs walking the chain, which no constraint can
        // see (ADR-024).
        await this.assertNotDescendant(locationId, input.parentId);
        await this.assertDepthAllows(input.parentId);
      }
    }

    try {
      await this.tenantDb.update(
        locations,
        input,
        eq(locations.id, locationId),
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          `Code ${input.code} is already used in this location`,
        );
      }
      throw error;
    }

    this.logger.log(`Location ${locationId} updated`);
  }

  /**
   * Refuses to move a location under one of its own descendants, which would
   * detach the whole subtree from the tree — every row still present, none of
   * them reachable from a root.
   */
  private async assertNotDescendant(
    locationId: string,
    candidateParentId: string,
  ): Promise<void> {
    let current: string | null = candidateParentId;

    for (let depth = 0; depth < MAX_DEPTH && current !== null; depth += 1) {
      if (current === locationId) {
        throw new BadRequestException(
          'A location cannot be moved inside itself',
        );
      }

      if (current === locationId) {
        throw new BadRequestException(
          'A location cannot be moved inside itself',
        );
      }

      current = await this.parentOf(current);
    }
  }

  private async assertDepthAllows(parentId: string): Promise<void> {
    let current: string | null = parentId;
    let depth = 1;

    while (current !== null && depth <= MAX_DEPTH) {
      current = await this.parentOf(current);
      depth += 1;
    }

    if (depth > MAX_DEPTH) {
      throw new BadRequestException('Location nesting is too deep');
    }
  }
  /** Null when the location does not exist or is at the top level. */
  private async parentOf(locationId: string): Promise<string | null> {
    const [row] = await this.tenantDb.select(
      locations,
      eq(locations.id, locationId),
    );

    return row?.parentId ?? null;
  }
}
