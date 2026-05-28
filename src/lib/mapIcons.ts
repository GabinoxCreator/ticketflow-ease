import { Tv, DoorOpen, Footprints, Music, Beer, Disc, LogOut, UtensilsCrossed, LucideIcon } from 'lucide-react';
import type React from 'react';
import { WcMaleIcon, WcFemaleIcon } from './customMapIcons';

type MapIconComponent = LucideIcon | React.ComponentType<React.SVGProps<SVGSVGElement> & { size?: number }>;
export interface MapIconOption { id: string; label: string; icon: MapIconComponent; }

export const MAP_ICONS: MapIconOption[] = [
  { id: 'tv', label: 'TV', icon: Tv },
  { id: 'wc_male', label: 'WC Masc.', icon: WcMaleIcon },
  { id: 'wc_female', label: 'WC Fem.', icon: WcFemaleIcon },
  { id: 'door', label: 'Porta', icon: DoorOpen },
  { id: 'stairs', label: 'Escada', icon: Footprints },
  { id: 'stage', label: 'Palco', icon: Music },
  { id: 'bar', label: 'Bar', icon: Beer },
  { id: 'dj', label: 'DJ', icon: Disc },
  { id: 'exit', label: 'Saída', icon: LogOut },
  { id: 'kitchen', label: 'Cozinha', icon: UtensilsCrossed },
];

export function getMapIcon(iconId: string): MapIconComponent | null {
  return MAP_ICONS.find(i => i.id === iconId)?.icon || null;
}
