/** Convert kebab-case to camelCase: 'hello-world' → 'helloWorld'. */
export function camel(s) {
  return s.split('-').map((part, i) => (i === 0 ? part : part[0].toUpperCase() + part.slice(1))).join('');
}

/** Convert camelCase to kebab-case: 'helloWorld' → 'hello-world'. */
export function kebab(s) {
  return s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}
