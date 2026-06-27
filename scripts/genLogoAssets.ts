/**
 * One-off generator: rasterizes the brand SVGs into the PNG assets that native
 * config (icon, adaptive icon, splash, favicon) requires. Run with `bun run`.
 */
import sharp from 'sharp'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dir, '..')
const logoDir = join(root, 'assets/logo')
const out = join(root, 'assets/images')

const DARK = '#111827'

const signet = readFileSync(join(logoDir, 'vescape-sygnet.svg'), 'utf8')
const text = readFileSync(join(logoDir, 'Vescape-text.svg'), 'utf8')

// Monochrome signet: drop the gradient-filled path + defs, force white fill.
const signetMono = signet
  .replace(/<path d="[^"]*" fill="url\(#[^)]*\)"\/>/, '')
  .replace(/<defs>[\s\S]*?<\/defs>/, '')
  .replace(/fill="#38BDF8"/g, 'fill="#FFFFFF"')

const svg = (s: string) => Buffer.from(s)

const render = (src: string, size: number) =>
  sharp(svg(src)).resize(size, size, { fit: 'contain', background: '#00000000' }).png()

async function main() {
  // iOS / store icon — opaque dark background.
  await render(signet, 1024).flatten({ background: DARK }).toFile(join(out, 'icon.png'))

  // Android adaptive icon layers. The launcher crops the foreground to a
  // center safe zone, so render the mark smaller and pad it to 512.
  const fgInner = 320
  const fgPad = (512 - fgInner) / 2
  await render(signet, fgInner)
    .extend({ top: fgPad, bottom: fgPad, left: fgPad, right: fgPad, background: '#00000000' })
    .toFile(join(out, 'androidIconForeground.png'))
  await sharp({
    create: { width: 512, height: 512, channels: 4, background: DARK },
  })
    .png()
    .toFile(join(out, 'androidIconBackground.png'))
  const monoInner = 270
  const monoPad = (432 - monoInner) / 2
  await render(signetMono, monoInner)
    .extend({
      top: monoPad,
      bottom: monoPad,
      left: monoPad,
      right: monoPad,
      background: '#00000000',
    })
    .toFile(join(out, 'androidIconMonochrome.png'))

  // Web favicon.
  await render(signet, 48).toFile(join(out, 'favicon.png'))

  // Splash + in-app loader use the horizontal wordmark.
  await sharp(svg(text))
    .resize({ width: 1200, fit: 'contain', background: '#00000000' })
    .png()
    .toFile(join(out, 'splashIcon.png'))

  console.log('Logo assets regenerated.')
}

void main()
