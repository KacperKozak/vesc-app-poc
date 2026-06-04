import {
  ArrowBendDoubleUpRightIcon,
  ChargingStationIcon,
  CompassIcon,
  DropIcon,
  EyeIcon,
  FlagIcon,
  MountainsIcon,
  type Icon,
} from 'phosphor-react-native'
import type { MapPointKind } from 'vesc-ble'

const MAP_POINT_KIND_ICONS: Record<MapPointKind, Icon> = {
  direction: CompassIcon,
  drop: DropIcon,
  bonk: MountainsIcon,
  nose_slide: ArrowBendDoubleUpRightIcon,
  trail_entry: FlagIcon,
  viewpoint: EyeIcon,
  charging: ChargingStationIcon,
  charging_food: ChargingStationIcon,
}

export function getMapPointKindIcon(kind: MapPointKind) {
  return MAP_POINT_KIND_ICONS[kind]
}
