#!/usr/bin/env node

/**
 * Unused and dynamic i18n key detector (#906).
 *
 * Collects every `t('...')` / `tc('...')` literal from source files and
 * compares them against the en.json catalog keys. Reports:
 *
 *   1. Catalog keys that are never referenced (exit 1 — CI fails).
 *   2. Dynamic key usages `t(`...`)` that bypass static checking (warn only).
 *
 * Exits 1 when unused keys are found, 0 otherwise.
 */

import fs from 'node:fs'
import path from 'node:path'

const SRC_DIR = path.join(process.cwd(), 'src')
const MESSAGES_PATH = path.join(process.cwd(), 'messages', 'en.json')

/** Match `t('...')`, `tc('...')`, `tErr('...')`, `t.rich('...')` with a string literal. */
const STATIC_KEY_RE = /\bt(?:c|Err|\.(?:rich|markup|raw))?\(\s*['"`]([\w.]+)['"`]/g

/** Match `t(`...`)` / `t.rich(`...`)` with a template literal (dynamic key). */
const DYNAMIC_KEY_RE = /\bt(?:c|Err|\.(?:rich|markup|raw))?\(\s*`([^`]*)`/g

function walkSync(dir, fileList = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walkSync(full, fileList)
    } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      if (entry.name.includes('.test.') || entry.name.includes('.spec.')) continue
      fileList.push(full)
    }
  }
  return fileList
}

function getLeafKeys(obj, prefix = '') {
  const keys = []
  for (const key of Object.keys(obj)) {
    const p = prefix ? `${prefix}.${key}` : key
    const val = obj[key]
    if (typeof val === 'object' && val !== null) {
      keys.push(...getLeafKeys(val, p))
    } else {
      keys.push(p)
    }
  }
  return keys
}

try {
  const catalog = JSON.parse(fs.readFileSync(MESSAGES_PATH, 'utf-8'))
  const catalogKeys = getLeafKeys(catalog)
  const catalogSet = new Set(catalogKeys)

  const files = walkSync(SRC_DIR)
  const usedSuffixes = new Set()
  const usedFullKeys = new Set()
  const dynamicUsages = []

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8')
    const rel = path.relative(process.cwd(), file)

    for (const m of content.matchAll(STATIC_KEY_RE)) {
      const raw = m[1]
      usedFullKeys.add(raw)
      // Also record the last segment for bare-key matching.
      const parts = raw.split('.')
      usedSuffixes.add(parts[parts.length - 1])
    }

    for (const m of content.matchAll(DYNAMIC_KEY_RE)) {
      const expr = m[1]
      const line = content.slice(0, m.index).split('\n').length
      dynamicUsages.push({ file: rel, line, expr })
    }
  }

  // Report dynamic key usages (warn only).
  if (dynamicUsages.length > 0) {
    console.log(`\n⚠  Dynamic key usages (${dynamicUsages.length}) — review manually:\n`)
    for (const u of dynamicUsages) {
      console.log(`  ${u.file}:${u.line}  t(\`${u.expr}\`)`)
    }
  }

  // Find unused catalog keys: a key is used if its full path or its last
  // segment appears in a static t() call.
  const unused = catalogKeys.filter((k) => {
    if (usedFullKeys.has(k)) return false
    const last = k.split('.').pop()
    return !usedSuffixes.has(last)
  }).sort()

  if (unused.length > 0) {
    console.error(`\n✗  Unused catalog keys (${unused.length}):\n`)
    for (const k of unused) {
      console.error(`  ${k}`)
    }
    console.error(`\nRemove the keys above from messages/en.json (and all locales) or reference them in source.`)
    process.exit(1)
  }

  console.log(`\n✓  All ${catalogKeys.length} catalog keys are referenced in source.`)
  if (dynamicUsages.length > 0) {
    console.log(`  (${dynamicUsages.length} dynamic key usages listed above for review)`)
  }
} catch (err) {
  console.error(`Error: ${err.message}`)
  process.exit(1)
}
