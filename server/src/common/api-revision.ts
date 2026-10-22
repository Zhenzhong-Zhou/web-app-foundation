/**
 * The API's revision within /v1 (ADR-081, amending ADR-013). The app's own
 * client sends the revision it was built against as X-Api-Revision, and a
 * request from an older one is refused before anything is read, so a tab
 * open across a deploy is told to reload rather than misread.
 *
 * It rises by one, in the commit that makes the change, with a breaking
 * change: a field removed or renamed, one newly required in a request, a
 * type or a format changed, a route removed, a value removed from a list a
 * request takes. Every tab still open is then refused until it reloads.
 *
 * It stays with an additive change: a new route, a new optional field in a
 * request, a new field in a response. It stays too where old tabs matter
 * more than the effort and the old shape is kept working instead, logged
 * until nothing sends it, as ADR-052's lenient mode did.
 *
 * `npm run api` writes it into the document's info.version, as
 * 1.<revision>, and from there into client/src/api/.
 */
export const API_REVISION = 1;
