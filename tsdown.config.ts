import { defineConfig } from 'tsdown';

// The package: one ES module and its types. three stays the page's own copy (a peer).
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'browser',
  dts: true,
  clean: true,
});
