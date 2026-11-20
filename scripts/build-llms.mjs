#!/usr/bin/env node
// Generates public/llms.txt and public/llms-full.txt from scripts/llms-manifest.mjs.
//
// The inlined source markdown lives in the out-layer/outlayer monorepo this repo was
// extracted from. The committed public/llms*.txt are what the site serves, and only
// the `llms` workflow (.github/workflows/llms.yml) regenerates them — when the docs
// in out-layer/outlayer change — from a fresh clone, committing when they changed.
//
// Two modes:
//   --check   what `npm run dev` and `npm run build` run (predev/prebuild): the
//             committed files exist and the docs sidebar matches the manifest.
//             LLMS_SOURCES_ROOT is not read — no host's checkout, however old,
//             can replace the committed docs at build time.
//   default   regenerate from LLMS_SOURCES_ROOT (shell, .env.local or .env, loaded
//             through Next's own loader). The workflow runs it with --strict, which
//             fails on a missing source file instead of warning.

import { existsSync, readFileSync, statSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { posix } from 'node:path'
import { fileURLToPath } from 'node:url'

import nextEnv from '@next/env'

const { loadEnvConfig } = nextEnv

import { DOCS_NAV_PATHS, FULL_TEXT_SOURCES, SECTIONS, SITE } from './llms-manifest.mjs'

/**
 * Submodule path -> the URL of the repository it lives in.
 *
 * Needed because a submodule is a gitlink, not a directory: GitHub cannot render
 * `<monorepo>/tree/main/wasi-examples/oracle-example`, it 404s. Every example under
 * wasi-examples/ is a submodule, so without this every example link in llms-full.txt is dead.
 */
function readSubmodules() {
  const map = new Map()
  let gitmodules
  try {
    gitmodules = readFileSync(resolve(repoRoot, '.gitmodules'), 'utf8')
  } catch {
    return map
  }
  let path = null
  for (const line of gitmodules.split('\n')) {
    const p = line.match(/^\s*path\s*=\s*(\S+)/)
    if (p) path = p[1]
    const u = line.match(/^\s*url\s*=\s*(\S+)/)
    if (u && path) {
      const url = u[1]
        .replace(/^git@github\.com:/, 'https://github.com/')
        .replace(/\.git$/, '')
        .replace(/\/$/, '')
      map.set(path, url)
      path = null
    }
  }
  return map
}

/** If `target` is a submodule or a path inside one, the URL that actually resolves. */
function submoduleUrl(target) {
  for (const [path, url] of SUBMODULES) {
    if (target === path) return { url, rest: '' }
    if (target.startsWith(path + '/')) return { url, rest: target.slice(path.length + 1) }
  }
  return null
}

const scriptDir = dirname(fileURLToPath(import.meta.url))
const dashboardDir = resolve(scriptDir, '..')

const check = process.argv.includes('--check')

// Pull .env.local / .env into process.env with Next's own loader, so
// LLMS_SOURCES_ROOT can live in an env file instead of the command line. Not in
// --check: a build never regenerates.
if (!check) loadEnvConfig(dashboardDir)

const repoRoot = !check && process.env.LLMS_SOURCES_ROOT ? resolve(process.env.LLMS_SOURCES_ROOT) : null

// Declared after repoRoot on purpose: readSubmodules() needs it. An empty map here would
// silently send every example link back to a 404, so it is loud rather than best-effort.
const SUBMODULES = repoRoot ? readSubmodules() : new Map()
if (repoRoot && SUBMODULES.size === 0) {
  console.warn('llms: no submodules found in .gitmodules — example links will not resolve')
}
const publicDir = resolve(dashboardDir, 'public')

const strict = process.argv.includes('--strict')

/** Absolute URL for a manifest entry: either an explicit `url` or a site-relative `path`. */
function entryUrl(entry) {
  return entry.url ?? `${SITE.baseUrl}${entry.path}`
}

function renderLinkList(pages) {
  return pages.map((p) => `- [${p.title}](${entryUrl(p)}): ${p.summary}`).join('\n')
}

function buildIndex() {
  const parts = [`# ${SITE.name}`, '', `> ${SITE.summary}`, '', SITE.details.join('\n\n')]

  for (const section of SECTIONS) {
    parts.push('', `## ${section.title}`, '', renderLinkList(section.pages))
  }

  return `${parts.join('\n')}\n`
}

/**
 * Rewrites repository-relative markdown links to absolute GitHub URLs.
 * Inlined docs lose their directory context, so `[CLI](docs/CLI.md)` would otherwise dangle.
 *
 * Only targets that actually exist in this repository are rewritten — several docs link into
 * the private coordinator repo, and turning those into public URLs would fabricate dead links.
 */
function absolutizeLinks(markdown, sourcePath) {
  const sourceDir = posix.dirname(sourcePath)

  return markdown.replace(/\]\(([^)\s]+)(\s+"[^"]*")?\)/g, (match, target, title = '') => {
    if (/^(https?:|mailto:|#|\/)/.test(target)) return match

    const [pathPart, anchor = ''] = target.split(/(#.*)$/)
    if (!pathPart) return match

    const resolved = posix.normalize(posix.join(sourceDir, pathPart))
    if (resolved.startsWith('..')) return match
    if (resolved === '.') return `](${SITE.repoUrl}${anchor}${title})`

    // Inside a submodule the kind is read from the link itself (a trailing `/` is a
    // directory), never from the disk: a checkout without its submodules — the llms
    // workflow's — has no file to look at, and the link must not depend on that.
    // GitHub redirects /blob/ to /tree/ for a directory linked without the slash.
    const sub = submoduleUrl(resolved.replace(/\/$/, ''))
    if (sub) {
      if (!sub.rest) return `](${sub.url}${anchor}${title})`
      const subKind = pathPart.endsWith('/') ? 'tree' : 'blob'
      return `](${sub.url}/${subKind}/main/${sub.rest.replace(/\/$/, '')}${anchor}${title})`
    }

    let stats
    try {
      stats = statSync(resolve(repoRoot, resolved))
    } catch {
      return match
    }

    const kind = stats.isDirectory() ? 'tree' : 'blob'
    return `](${SITE.repoUrl}/${kind}/main/${resolved}${anchor}${title})`
  })
}

async function loadSources() {
  const loaded = []
  const missing = []

  for (const source of FULL_TEXT_SOURCES) {
    try {
      const raw = await readFile(resolve(repoRoot, source.path), 'utf8')
      loaded.push({ ...source, body: absolutizeLinks(raw.trim(), source.path) })
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
      missing.push(source.path)
    }
  }

  return { loaded, missing }
}

function buildFullText(sources) {
  const toc = sources
    .map((s) => `- ${s.title} — \`${s.path}\``)
    .join('\n')

  const parts = [
    `# ${SITE.name} — Full Documentation`,
    '',
    `> ${SITE.summary}`,
    '',
    SITE.details.join('\n\n'),
    '',
    'This file inlines every developer-facing document in the OutLayer repository.',
    `For a link index instead, fetch ${SITE.baseUrl}/llms.txt.`,
    '',
    '## Contents',
    '',
    toc,
  ]

  for (const source of sources) {
    parts.push(
      '',
      '---',
      '',
      `<!-- source: ${source.path} -->`,
      `> Source: ${SITE.repoUrl}/blob/main/${source.path}`,
      '',
      source.body,
    )
  }

  return `${parts.join('\n')}\n`
}

/**
 * The sidebar (lib/docs-nav.mjs) owns the docs page set; the manifest owns the
 * editorial titles/summaries. A page present in one but not the other is drift.
 * Runs on every build — including standalone clones with no LLMS_SOURCES_ROOT.
 */
function checkDocsNavSync() {
  const manifestPaths = new Set(
    SECTIONS.flatMap((s) => s.pages).flatMap((p) => (p.path ? [p.path] : [])),
  )
  const missingInManifest = [...DOCS_NAV_PATHS].filter((p) => !manifestPaths.has(p))
  const missingInNav = [...manifestPaths].filter((p) => !DOCS_NAV_PATHS.has(p))

  if (missingInManifest.length === 0 && missingInNav.length === 0) return

  const message =
    'llms: docs sidebar and llms manifest disagree on the page set:\n' +
    missingInManifest.map((p) => `  - ${p} is in lib/docs-nav.mjs but not scripts/llms-manifest.mjs`).join('\n') +
    missingInNav.map((p) => `  - ${p} is in scripts/llms-manifest.mjs but not lib/docs-nav.mjs`).join('\n')

  if (strict) throw new Error(message)
  console.warn(message)
}

async function main() {
  checkDocsNavSync()

  if (!repoRoot) {
    const missingArtifacts = ['llms.txt', 'llms-full.txt'].filter(
      (f) => !existsSync(resolve(publicDir, f)),
    )
    if (missingArtifacts.length > 0) {
      throw new Error(
        `llms: committed public/${missingArtifacts.join(', public/')} missing and ` +
          'LLMS_SOURCES_ROOT is not set. Point it at a local out-layer/outlayer checkout to generate.',
      )
    }
    console.log(
      check
        ? 'llms: serving the committed public/llms.txt and public/llms-full.txt ' +
            '(the llms workflow regenerates them)'
        : 'llms: LLMS_SOURCES_ROOT is not set — nothing to regenerate from; ' +
            'the committed public/llms.txt and public/llms-full.txt stay',
    )
    return
  }

  const { loaded, missing } = await loadSources()

  if (missing.length > 0) {
    const message =
      `llms: ${missing.length} source file(s) listed in scripts/llms-manifest.mjs are missing:\n` +
      missing.map((p) => `  - ${p}`).join('\n')

    if (strict) throw new Error(message)
    console.warn(`${message}\nUpdate the manifest — these docs are absent from llms-full.txt.`)
  }

  if (loaded.length === 0) {
    throw new Error(
      `llms: no source documents resolved under ${repoRoot}. ` +
        'llms-full.txt would be empty, refusing to write.',
    )
  }

  const index = buildIndex()
  const full = buildFullText(loaded)

  await writeFile(resolve(publicDir, 'llms.txt'), index, 'utf8')
  await writeFile(resolve(publicDir, 'llms-full.txt'), full, 'utf8')

  const kb = (text) => `${Math.round(Buffer.byteLength(text) / 1024)} KB`
  const linkCount = SECTIONS.reduce((n, s) => n + s.pages.length, 0)
  console.log(
    `llms: wrote public/llms.txt (${linkCount} links, ${kb(index)}) ` +
      `and public/llms-full.txt (${loaded.length} documents, ${kb(full)})`,
  )
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
