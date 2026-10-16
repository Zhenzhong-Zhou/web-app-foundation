/**
 * The site a document names (ADR-071, amended): a purchase order's Deliver
 * to, an RMA's Send back to. Its name for the page; its address is read
 * from the site when a document prints it, so a change reaches the next
 * printing.
 */
export class ChosenSite {
  id!: string;
  name!: string;
}
