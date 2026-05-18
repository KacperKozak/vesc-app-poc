# React Native

React Native UI conventions for this repo. Add component, styling, navigation, animation, and Expo Router guidance here when it becomes stable enough to apply across the app.

## Icons

Use **`phosphor-react-native`** for all icons. Do **not** use emoji or unicode characters as icon substitutes.

```tsx
import { LightningIcon, WarningCircleIcon } from 'phosphor-react-native'

<LightningIcon size={16} color="#4ade80" weight="fill" />
```

- Always use the **`Icon`-suffixed** export, for example `LightningIcon`, not `Lightning`. The un-suffixed names are deprecated and will produce warnings.
- The `type Icon` export for typing icon props is **not** suffixed; import it as `type Icon` as-is.
- `size` is typically `10`-`16` for inline or label icons, larger for standalone UI elements.
