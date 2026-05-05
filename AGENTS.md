# Agent Guidelines

## Package Manager

Always use **bun** for all package management and script execution:

- Install dependencies: `bun install`
- Add packages: `bun add <package>`
- Remove packages: `bun remove <package>`
- Run scripts: `bun run <script>`
- Execute binaries: `bunx <binary>`
- Run tests: `bun test`

Do **not** use `npm`, `yarn`, `npx`, or `pnpm`.

## Architecture Discipline

This is a PoC, but keep it sharp:

- Native owns durable truth and long-lived work; JS renders state and sends intents.
- Design for lifecycle breaks: reloads, backgrounding, process death, and restart.
- Prefer clear architecture over compatibility, shortcuts, or hidden assumptions.
- Make one focused stability change at a time when isolating bugs.
- Remove unused code when replacing a path; do not keep dead code for later.

## Icons

Use **`phosphor-react-native`** for all icons. Do **not** use emoji or unicode characters as icon substitutes.

```tsx
import { LightningIcon, WarningCircleIcon } from 'phosphor-react-native'

<LightningIcon size={16} color="#4ade80" weight="fill" />
```

- Always use the **`Icon`-suffixed** export (e.g. `LightningIcon`, not `Lightning`). The un-suffixed names are deprecated and will produce warnings.
- The `type Icon` export (for typing icon props) is **not** suffixed — import it as `type Icon` as-is.
- `weight="fill"` is the standard style used throughout the app
- `size` is typically `10`–`16` for inline/label icons, larger for standalone UI elements
- Browse available icons at https://phosphoricons.com (filter by React Native support)
