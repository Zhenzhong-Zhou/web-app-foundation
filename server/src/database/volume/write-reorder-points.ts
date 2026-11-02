import type { SetReorderPointDto } from '../../modules/stock/dto/set-reorder-point.dto';
import type { ReorderPointsService } from '../../modules/stock/reorder-points.service';

/** An item the volume seed may give a reorder point (ADR-085). */
export interface PointCandidate {
  variantId: string;
  /** It has an active recipe, so a run makes it. */
  made: boolean;
  /** On hand less what sales hold, in whole units, by the seed's count. */
  free: number;
}

/**
 * Points on a fifth of an organization's items (ADR-085), every fifth in
 * the catalogue's order: a third of them set above what is free, so low
 * unless enough is on its way, the rest at half of it; the three rules in
 * turn. By position rather than by the random source, so the year before
 * it is written as it was, and the same items get the same points however
 * their figures were gathered. Returns how many were set.
 */
export async function writeReorderPoints(
  reorderPoints: ReorderPointsService,
  candidates: PointCandidate[],
): Promise<number> {
  const chosen = candidates.filter((_, index) => index % 5 === 4);

  for (const [index, item] of chosen.entries()) {
    const point =
      index % 3 === 0
        ? Math.round(item.free * 1.5) + 10
        : Math.max(1, Math.round(item.free / 2));

    await reorderPoints.create(item.variantId, {
      source: item.made ? 'made' : 'bought',
      reorderPoint: String(point),
      ...ruleFor(Math.floor(index / 3) % 3, point),
    });
  }

  return chosen.length;
}

function ruleFor(
  turn: number,
  point: number,
): Pick<SetReorderPointDto, 'rule' | 'fixedQuantity' | 'maximumQuantity'> {
  if (turn === 1) return { rule: 'fixed', fixedQuantity: '48' };
  if (turn === 2)
    return { rule: 'maximum', maximumQuantity: String(point * 3) };
  return { rule: 'just_enough' };
}
