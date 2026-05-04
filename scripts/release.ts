#!/usr/bin/env bun
import { $ } from 'bun'
import { join } from 'path'

const isPatch = process.argv.includes('--patch')
const root = import.meta.dir + '/..'

function bumpVersion(version: string, patch: boolean): string {
  const [major, minor, fix] = version.split('.').map(Number)
  if (patch) return `${major}.${minor}.${fix + 1}`
  return `${major}.${minor + 1}.0`
}

async function run(label: string, cmd: string) {
  console.log(`\n→ ${label}`)
  const result = await $`sh -c ${cmd}`.cwd(root).nothrow()
  if (result.exitCode !== 0) {
    console.error(`✗ ${label} failed`)
    process.exit(1)
  }
  console.log(`✓ ${label}`)
}

async function ensureCleanWorkingTree() {
  const status = await $`git status --porcelain`.cwd(root).text()
  if (status.trim().length > 0) {
    console.error('✗ Working tree is not clean. Commit or stash changes before release.')
    process.exit(1)
  }
  console.log('✓ Working tree is clean')
}

async function ensureBranch(branch: string) {
  const current = await $`git branch --show-current`.cwd(root).text()
  if (current.trim() !== branch) {
    console.error(`✗ Must be on "${branch}" branch to release (current: ${current.trim()})`)
    process.exit(1)
  }
  console.log(`✓ On branch "${branch}"`)
}

await ensureBranch('dev')
await ensureCleanWorkingTree()
await run('Pull latest', 'git pull')
await run('TypeScript check', 'bun run ts')
await run('Lint', 'bun run lint')
await run('Tests', 'bun run test')
await run('Build release APK', 'bun run build:release')

// Bump version in package.json
const pkgPath = join(root, 'package.json')
const pkg = JSON.parse(await Bun.file(pkgPath).text())
const oldVersion: string = pkg.version
const newVersion = bumpVersion(oldVersion, isPatch)
pkg.version = newVersion
await Bun.write(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
console.log(`\n→ Version bumped ${oldVersion} → ${newVersion}`)

// Commit + push version bump on dev
await run('Commit version bump', `git add package.json && git commit -m "${newVersion}"`)
await run('Push dev', 'git push')

// Merge dev → main
await run('Switch to main', 'git checkout main')
await run('Pull main', 'git pull')
await run('Merge dev → main', `git merge dev --no-ff -m "release: ${newVersion}"`)
await run('Push main', 'git push')

// Back to dev
await run('Switch back to dev', 'git checkout dev')

// Copy APK to Google Drive
const apkSrc = join(root, 'android/app/build/outputs/apk/release/app-release.apk')
const driveDir =
  '/Users/kacperkozak/Library/CloudStorage/GoogleDrive-dexted.xt@gmail.com/My Drive/Apps'
await $`mkdir -p ${driveDir}`
const apkDest = join(driveDir, `vibe-wheel-v${newVersion}.apk`)
await Bun.write(apkDest, Bun.file(apkSrc))
console.log(`✓ Copied APK → ${apkDest}`)

console.log(`\n✓ Release ${newVersion} complete`)
