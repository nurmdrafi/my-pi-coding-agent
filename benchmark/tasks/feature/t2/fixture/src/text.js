/** Number of whitespace-separated words in `s`. */
export function wordCount(s) {
  return s.trim().length ? s.trim().split(/\s+/).length : 0;
}
