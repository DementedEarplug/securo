/// <reference types="node" />
import fs from 'fs'
import path from 'path'

// Per-icon imports are typed by a wildcard, so tsc can't catch a name Lucide
// renamed (building-2 → building-complex, history → …); Metro would fail at
// bundle time. Check every one against the installed package instead.
const ROOT = path.resolve(__dirname, '../..')
const ICONS = path.join(ROOT, 'node_modules/lucide-react-native/dist/esm/icons')

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry: fs.Dirent) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(full)
    return /\.tsx?$/.test(entry.name) ? [full] : []
  })
}

it('imports only Lucide icons that exist', () => {
  const missing: string[] = []
  for (const file of [...sourceFiles(path.join(ROOT, 'app')), ...sourceFiles(path.join(ROOT, 'src'))]) {
    for (const [, name] of fs.readFileSync(file, 'utf8').matchAll(/lucide-react-native\/icons\/([a-z0-9-]+)'/g)) {
      if (!fs.existsSync(path.join(ICONS, `${name}.mjs`))) missing.push(`${path.relative(ROOT, file)}: ${name}`)
    }
  }
  expect(missing).toEqual([])
})
