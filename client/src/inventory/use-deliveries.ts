import type { Delivery } from '../api/types.gen';
import { useResource } from '../lib/use-resource';

/**
 * The deliveries a receipt of this item may be (ADR-093, v3): its
 * confirmed purchases still to come, read once an item is chosen, so
 * Receive stock asks which one before receiving it. Null, none is read:
 * no item yet, or a reader the screen does not ask, one who may not see
 * orders and receive on them (GET /orders/deliveries asks both).
 */
export function useDeliveries(variantId: string | null): {
  deliveries: Delivery[];
  /** The read has answered, rows or a failure; a failure offers none. */
  answered: boolean;
} {
  const { data, failure } = useResource<Delivery[]>(
    variantId
      ? `/orders/deliveries?variantId=${encodeURIComponent(variantId)}`
      : null,
  );

  return {
    deliveries: data ?? [],
    answered: !variantId || data !== null || failure !== null,
  };
}
