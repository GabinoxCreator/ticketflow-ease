import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Square, Circle, Type, Minus, Armchair, Settings2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { MAP_ICONS } from '@/lib/mapIcons';
import type { SeatTypeLite } from './DraggableSeat';

interface EditorToolbarProps {
  seatTypes: SeatTypeLite[];
  onAddSeat: (seatTypeId: string) => void;
  onAddShape: (shape: 'rect' | 'circle' | 'text' | 'line') => void;
  onAddIcon: (iconId: string) => void;
  backgroundColor: string;
  onBackgroundColorChange: (color: string) => void;
}

export default function EditorToolbar({
  seatTypes,
  onAddSeat,
  onAddShape,
  onAddIcon,
  backgroundColor,
  onBackgroundColorChange,
}: EditorToolbarProps) {
  return (
    <div className="w-56 bg-card border-r p-4 space-y-6 overflow-y-auto">
      {/* Adicionar Assento — dinâmico por seat_type */}
      <div className="space-y-3">
        <Label className="text-xs font-semibold uppercase text-muted-foreground">
          Adicionar Assento
        </Label>

        {seatTypes.length === 0 ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Nenhum tipo de assento cadastrado.
            </p>
            <Button asChild variant="outline" size="sm" className="w-full">
              <Link to="/produtor/tipos-de-assento">
                <Settings2 className="w-4 h-4 mr-2" />
                Criar tipos
              </Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {seatTypes.map((st) => (
              <Button
                key={st.id}
                variant="outline"
                className="w-full justify-start gap-2"
                onClick={() => onAddSeat(st.id)}
              >
                <div
                  className="w-6 h-6 border-2 flex items-center justify-center flex-shrink-0"
                  style={{
                    borderColor: st.default_color ?? '#6366f1',
                    borderRadius: st.shape === 'circle' ? '9999px' : '0.25rem',
                  }}
                >
                  <Armchair className="w-3 h-3" style={{ color: st.default_color ?? '#6366f1' }} />
                </div>
                <span className="truncate text-left">
                  {st.name}
                  <span className="text-muted-foreground"> ({st.base_capacity}-{st.max_capacity}p)</span>
                </span>
              </Button>
            ))}
            <Button asChild variant="ghost" size="sm" className="w-full text-xs text-muted-foreground">
              <Link to="/produtor/tipos-de-assento">
                <Settings2 className="w-3 h-3 mr-1" />
                Gerenciar tipos
              </Link>
            </Button>
          </div>
        )}
      </div>

      <Separator />

      {/* Adicionar Objeto */}
      <div className="space-y-3">
        <Label className="text-xs font-semibold uppercase text-muted-foreground">
          Adicionar Objeto
        </Label>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" size="sm" className="flex-col h-16 gap-1" onClick={() => onAddShape('text')}>
            <Type className="w-4 h-4" /><span className="text-xs">Texto</span>
          </Button>
          <Button variant="outline" size="sm" className="flex-col h-16 gap-1" onClick={() => onAddShape('rect')}>
            <Square className="w-4 h-4" /><span className="text-xs">Retângulo</span>
          </Button>
          <Button variant="outline" size="sm" className="flex-col h-16 gap-1" onClick={() => onAddShape('circle')}>
            <Circle className="w-4 h-4" /><span className="text-xs">Círculo</span>
          </Button>
          <Button variant="outline" size="sm" className="flex-col h-16 gap-1" onClick={() => onAddShape('line')}>
            <Minus className="w-4 h-4" /><span className="text-xs">Linha</span>
          </Button>
        </div>
      </div>

      <Separator />

      {/* Adicionar Ícone */}
      <div className="space-y-3">
        <Label className="text-xs font-semibold uppercase text-muted-foreground">
          Adicionar Ícone
        </Label>
        <div className="grid grid-cols-3 gap-1.5">
          {MAP_ICONS.map((opt) => {
            const Icon = opt.icon;
            return (
              <Button
                key={opt.id}
                variant="outline"
                size="sm"
                className="flex-col h-14 gap-0.5 p-1"
                onClick={() => onAddIcon(opt.id)}
                title={opt.label}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] leading-tight truncate w-full text-center">{opt.label}</span>
              </Button>
            );
          })}
        </div>
      </div>

      <Separator />

      {/* Fundo */}
      <div className="space-y-3">
        <Label className="text-xs font-semibold uppercase text-muted-foreground">Fundo</Label>
        <div className="flex items-center gap-2">
          <Input
            type="color"
            value={backgroundColor}
            onChange={(e) => onBackgroundColorChange(e.target.value)}
            className="w-12 h-8 p-1 cursor-pointer"
          />
          <Input
            type="text"
            value={backgroundColor}
            onChange={(e) => onBackgroundColorChange(e.target.value)}
            className="flex-1 h-8 text-xs"
          />
        </div>
      </div>
    </div>
  );
}
