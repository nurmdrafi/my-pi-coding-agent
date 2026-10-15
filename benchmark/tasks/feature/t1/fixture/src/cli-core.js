/** Testable CLI core for `node src/cli.js [--upper] <name>`. */
export function run(argv) {
  const name = argv.find((a) => !a.startsWith('--'));
  if (!name) return { text: 'usage: cli [--upper] <name>', exit: 1 };
  return { text: `Hello, ${name}.`, exit: 0 };
}
