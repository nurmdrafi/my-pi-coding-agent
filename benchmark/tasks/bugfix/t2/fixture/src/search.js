/** True when `needle` occurs anywhere in `hay` (case-sensitive). */
export function contains(hay, needle) {
  return hay.indexOf(needle) > 0;
}

/** True when `s` ends with `suffix` — including when they are equal. */
export function endsWith(s, suffix) {
  return s.slice(-suffix.length) === suffix && s.length > suffix.length;
}
