/**
 * Build pipeline for @whittaker-edwards/redirect-js
 *
 * Outputs (all into dist/):
 *   we.redirect.esm.js   — ES module for modern bundlers          (package "module")
 *   we.redirect.umd.js   — UMD for npm/CommonJS consumers          (package "main")
 *   we.redirect.min.js   — minified standalone IIFE for CDN/<head> (package "browser")
 *
 * `gulp build`  → clean, bundle (rollup), minify (terser), banner all files
 * `gulp watch`  → rebuild on src changes
 * `gulp clean`  → empty dist/
 */

import gulp from 'gulp';
import { rollup } from 'rollup';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import terser from 'gulp-terser';
import header from 'gulp-header';
import rename from 'gulp-rename';
import { deleteAsync } from 'del';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url)));

const ENTRY = 'src/index.js';
const DIST = 'dist';

// Global name exposed for the UMD/IIFE builds (window.WERedirect in a browser).
const GLOBAL_NAME = 'WERedirect';

const banner = [
  '/*!',
  ` * ${pkg.name} v${pkg.version}`,
  ` * ${pkg.description}`,
  ` * (c) ${new Date().getFullYear()} ${pkg.author}`,
  ` * ${pkg.homepage}`,
  ' */',
  '',
].join('\n');

/** Remove previous build output. */
export function clean() {
  return deleteAsync([`${DIST}/**`, `!${DIST}`]);
}

/** Bundle ESM + UMD via rollup (unminified, banner attached). */
async function bundle() {
  const build = await rollup({
    input: ENTRY,
    plugins: [nodeResolve()],
  });

  await Promise.all([
    build.write({
      file: `${DIST}/we.redirect.esm.js`,
      format: 'es',
      banner,
      sourcemap: true,
    }),
    build.write({
      file: `${DIST}/we.redirect.umd.js`,
      format: 'umd',
      name: GLOBAL_NAME,
      banner,
      sourcemap: true,
      exports: 'named',
    }),
  ]);

  await build.close();
}

/**
 * Build the standalone minified IIFE for direct <head>/CDN inclusion.
 * Reuses the UMD bundle as terser input, renames to .min.js, re-adds banner.
 */
function minify() {
  return gulp
    .src(`${DIST}/we.redirect.umd.js`)
    .pipe(
      terser({
        compress: { passes: 2 },
        mangle: true,
        format: { comments: false },
      })
    )
    .pipe(rename('we.redirect.min.js'))
    .pipe(header(banner))
    .pipe(gulp.dest(DIST));
}

export const build = gulp.series(clean, bundle, minify);

export function watch() {
  gulp.watch('src/**/*.js', build);
}

export default build;
