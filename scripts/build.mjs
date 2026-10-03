#!/usr/bin/env node
// Builds the static site from content/site.json.
//
//   node scripts/build.mjs           write generated pages into the repo
//   node scripts/build.mjs --check   exit 1 if generated pages are out of date
//   node scripts/build.mjs --out DIR write the site to another folder (for testing)
//
// The editor's Publish button runs the same build in the browser (assets/js/build.js).
import { readFile, writeFile, mkdir, rm, cp } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSite, staleFiles } from '../assets/js/build.js';
import { migrate, validate, SCHEMA_VERSION } from '../assets/js/schema.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const check = args.includes('--check');
const outIdx = args.indexOf('--out');
const outDir = outIdx >= 0 ? resolve(args[outIdx + 1]) : root;

const read = (p) => readFile(join(root, p), 'utf8');
const readOr = (p, dir = root) => readFile(join(dir, p), 'utf8').catch(() => '');

const raw = JSON.parse(await read('content/site.json'));
const doc = migrate(raw);
const problems = validate(doc);
if (problems.length) {
  console.error('Content problems:\n' + problems.map((p) => `  - ${p}`).join('\n'));
  process.exit(1);
}

const cname = (await readOr('CNAME')).trim();
const { files, paths } = buildSite(doc, { origin: cname ? `https://${cname}` : '' });
const previous = await readOr('generated.json', outDir);
const stale = staleFiles(previous, paths);
const migrated = (Number(raw.version) || 1) !== SCHEMA_VERSION;
const contentJson = `${JSON.stringify(doc, null, 2)}\n`;

if (check) {
  const changed = [];
  for (const [path, content] of files) if ((await readOr(path)) !== content) changed.push(path);
  if (migrated) changed.push('content/site.json (needs migration)');
  changed.push(...stale.map((p) => `${p} (stale)`));
  if (changed.length) {
    console.error(`Generated files are out of date:\n${changed.map((p) => `  - ${p}`).join('\n')}\nRun: node scripts/build.mjs`);
    process.exit(1);
  }
  console.log(`All ${files.size} generated files are up to date.`);
  process.exit(0);
}

if (outDir !== root) {
  // Copy the static assets so the output folder is a complete, servable site.
  for (const p of ['assets', 'editor.html', 'preview.html', 'CNAME', '.nojekyll']) {
    await cp(join(root, p), join(outDir, p), { recursive: true }).catch(() => {});
  }
  await mkdir(join(outDir, 'content'), { recursive: true });
  await writeFile(join(outDir, 'content/site.json'), contentJson);
}
for (const [path, content] of files) {
  await mkdir(dirname(join(outDir, path)), { recursive: true });
  await writeFile(join(outDir, path), content);
}
for (const path of stale) {
  await rm(join(outDir, path), { force: true });
  await rm(dirname(join(outDir, path)), { recursive: false, force: true }).catch(() => {});
}
if (migrated && outDir === root) {
  await writeFile(join(root, 'content/site.json'), contentJson);
  console.log(`Upgraded content/site.json to format version ${SCHEMA_VERSION}.`);
}
console.log(`Built ${files.size} files${stale.length ? `, removed ${stale.length} old page(s)` : ''} → ${outDir === root ? 'repository' : outDir}`);
