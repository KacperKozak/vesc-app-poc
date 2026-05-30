import { copyFileSync, mkdirSync, readdirSync } from 'fs'
import { extname, join, parse } from 'path'

const ROOT = join(import.meta.dir, '..')
const ANDROID_SRC = join(ROOT, 'modules', 'vesc-ble', 'android', 'src')

const targets = [
  {
    src: join(ROOT, 'shared', 'alerts'),
    dest: join(ANDROID_SRC, 'main', 'res', 'raw'),
    extensions: new Set(['.ogg', '.wav']),
    rename: (file: string) =>
      `${parse(file).name}${extname(file)}`.toLowerCase().replace(/[^a-z0-9_.]/g, '_'),
  },
  {
    src: join(ROOT, 'shared', 'data'),
    dest: join(ANDROID_SRC, 'main', 'assets', 'data'),
    extensions: new Set(['.json']),
    rename: (file: string) => file,
  },
  {
    src: join(ROOT, 'shared', 'data'),
    dest: join(ANDROID_SRC, 'test', 'resources', 'data'),
    extensions: new Set(['.json']),
    rename: (file: string) => file,
  },
]

let totalCopied = 0

for (const { src, dest, extensions, rename } of targets) {
  mkdirSync(dest, { recursive: true })
  let copied = 0

  for (const file of readdirSync(src)) {
    if (!extensions.has(extname(file))) continue
    const outputName = rename(file)
    copyFileSync(join(src, file), join(dest, outputName))
    copied += 1
    console.log(`${src}/${file} -> ${dest}/${outputName}`)
  }

  console.log(`Copied ${copied} file(s) to ${dest}`)
  totalCopied += copied
}

if (totalCopied === 0) {
  throw new Error('No shared files found to copy')
}
