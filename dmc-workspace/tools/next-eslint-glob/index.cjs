// Fornece a compatibilidade de descoberta de ficheiros usada pela integração ESLint do
// Next.js.
// Compatibility adapter for the globSync call in @next/eslint-plugin-next.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { globSync } = require("tinyglobby");

exports.globSync = (patterns, options) =>
  globSync(patterns, { ...options, expandDirectories: false }).map((entry) =>
    entry.replace(/\/$/, ""),
  );
