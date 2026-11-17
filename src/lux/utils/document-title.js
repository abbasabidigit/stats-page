/**
 * Sets the browser tab title (WCAG 2.4.2). SSR-safe: no-op when `document`
 * is unavailable.
 * @param {string} title
 */
export function setDocumentTitle(title) {
  if (typeof document === 'undefined' || !title) return;
  document.title = title;
}
