import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// The playground: `npm run dev`, or `npm run build:playground` for GitHub Pages (under
// /creatures/). It imports the package's own source, and serves models/ beside the page.
const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig(({ command, isPreview }) => ({
  root: here('playground'),
  base: command === 'build' || isPreview ? '/creatures/' : '/',
  publicDir: here('models'),
  resolve: { alias: { '@wisdomousai/creatures': here('src/index.ts') } },
  // The crew are one module, a big one (2.4 MB, 650 KB gzipped): that's expected.
  build: { outDir: here('dist-playground'), emptyOutDir: true, chunkSizeWarningLimit: 3000 },
}));
