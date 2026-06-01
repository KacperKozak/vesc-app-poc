import {
  ArrowBendDoubleUpRightIcon,
  ChargingStationIcon,
  CompassIcon,
  DropIcon,
  EyeIcon,
  FlagIcon,
  ForkKnifeIcon,
  WarningCircleIcon,
  type Icon,
} from 'phosphor-react-native'
import type { MapPointKind } from 'vesc-ble'

const MAP_POINT_KIND_ICONS: Record<MapPointKind, Icon> = {
  direction: CompassIcon,
  drop: DropIcon,
  bonk: WarningCircleIcon,
  nose_slide: ArrowBendDoubleUpRightIcon,
  trail_entry: FlagIcon,
  viewpoint: EyeIcon,
  charging: ChargingStationIcon,
  charging_food: ForkKnifeIcon,
}

export function getMapPointKindIcon(kind: MapPointKind) {
  return MAP_POINT_KIND_ICONS[kind]
}
