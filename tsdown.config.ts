import { defineConfig } from 'tsdown';

// The package: one ES module and its types. three stays the page's own copy (a peer).
export default defineConfig({
  // families.ts again on its own: bin/creatures.mjs reads the names from it, and it has no three.
  entry: ['src/index.ts', 'src/families.ts'],
  format: ['esm'],
  platform: 'browser',
  dts: true,
  clean: true,
});
