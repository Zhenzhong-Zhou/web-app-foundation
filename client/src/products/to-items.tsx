import { Navigate, useLocation } from 'react-router-dom';

/**
 * Products became Items (ADR-092): an address under `/products`, from a
 * bookmark or a link kept elsewhere, opens the same page under `/items`,
 * with its query, in its place in the history.
 */
export function ToItems() {
  const { pathname, search, hash, state } = useLocation();
  const rest = pathname.replace(/^\/products/, '');
  return (
    <Navigate to={`/items${rest}${search}${hash}`} state={state} replace />
  );
}
