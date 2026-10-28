// Builds the playground page into site/dist/: index.html, styles, Mermaid's own classic build
// and one classic script with the plugin, the page code and every worked example. The tutorial
// goes into site/dist/tutorial/: one page per lesson and a classic script that draws its charts. All paths are
// relative and nothing is fetched, so the folder opens from file:// and can be served as is.
//
//   node site/build.ts [outdir]

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { tutorialPages } from './tutorial/pages.ts';

const siteDir = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(siteDir, '..', 'fixtures');

/** One entry in the page's Examples menu. */
export interface Example {
  /** The fixture directory name. */
  name: string;
  /** The chart's `title`, or the name when the chart has none. */
  title: string;
  /** `paper` for the paper's figures, `more` for the other worked examples. */
  group: 'paper' | 'more';
  text: string;
}

/** Reads every fixture's chart: the paper's figures first, in figure order, then the rest. */
export function collectExamples(dir = fixturesDir): Example[] {
  const examples = readdirSync(dir)
    .filter((entry) => statSync(join(dir, entry)).isDirectory())
    .map((name): Example => {
      const text = readFileSync(join(dir, name, 'chart.lsc'), 'utf8');
      const title = /^\s*title\s+(.+?)\s*$/m.exec(text)?.[1] ?? name;
      const figure = /^fig(\d+)-/.exec(name);
      return {
        name,
        title: figure ? `Fig. ${Number(figure[1])} — ${title}` : title,
        group: figure ? 'paper' : 'more',
        text,
      };
    });
  const rank = (e: Example) => (e.group === 'paper' ? 0 : 1);
  return examples.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

export interface BuildResult {
  outdir: string;
  files: string[];
}

/** The licence text of the package in `dir`, as a notice section. */
function licenceNotice(dir: string): string {
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
    name: string;
    version: string;
    license?: string;
  };
  const file = readdirSync(dir).find((entry) => /^(licen[cs]e|copying)(\.|$)/i.test(entry));
  const text = file ? readFileSync(join(dir, file), 'utf8').trim() : `License: ${pkg.license}`;
  return `${pkg.name} ${pkg.version} (${pkg.license ?? 'see below'})\n\n${text}\n`;
}

/** The directories of the third-party packages that went into the bundle. */
function bundledPackages(inputs: string[], workingDir: string): string[] {
  const dirs = new Set<string>();
  for (const input of inputs) {
    const match = /^(.*node_modules\/(?:@[^/]+\/)?[^/@.][^/]*)\//.exec(input);
    if (match?.[1]) dirs.add(resolve(workingDir, match[1]));
  }
  return [...dirs].filter((dir) => existsSync(join(dir, 'package.json')));
}

export async function buildSite(outdir = join(siteDir, 'dist')): Promise<BuildResult> {
  outdir = resolve(outdir);
  rmSync(outdir, { recursive: true, force: true });
  mkdirSync(outdir, { recursive: true });

  const result = await build({
    absWorkingDir: siteDir,
    entryPoints: {
      app: join(siteDir, 'src', 'main.ts'),
      'tutorial/tutorial': join(siteDir, 'src', 'tutorial.ts'),
    },
    outdir,
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    conditions: ['lsc-source'],
    define: { __EXAMPLES__: JSON.stringify(collectExamples()) },
    minify: true,
    sourcemap: 'linked',
    legalComments: 'none',
    metafile: true,
    logLevel: 'warning',
  });

  // Mermaid's classic build defines the global `mermaid` the page code uses.
  const require = createRequire(join(siteDir, 'package.json'));
  const mermaidDir = dirname(require.resolve('mermaid/package.json'));
  copyFileSync(join(mermaidDir, 'dist', 'mermaid.min.js'), join(outdir, 'mermaid.min.js'));
  const notices = [mermaidDir, ...bundledPackages(Object.keys(result.metafile.inputs), siteDir)]
    .map(licenceNotice)
    .sort((a, b) => a.localeCompare(b));
  writeFileSync(
    join(outdir, 'THIRD-PARTY-NOTICES.txt'),
    `This page includes the following third-party software.\n\n${notices.join(`\n${'-'.repeat(72)}\n\n`)}`,
  );
  copyFileSync(join(siteDir, '..', 'LICENSE'), join(outdir, 'LICENSE.txt'));
  for (const file of ['index.html', 'styles.css']) {
    copyFileSync(join(siteDir, 'src', file), join(outdir, file));
  }
  for (const { file, html } of await tutorialPages()) {
    writeFileSync(join(outdir, 'tutorial', file), html);
  }
  return { outdir, files: readdirSync(outdir).sort() };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { outdir, files } = await buildSite(process.argv[2]);
  console.log(`Built ${files.length} files into ${outdir}; open ${join(outdir, 'index.html')}`);
}
