import { useMemo } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Trash2, Armchair, Type, Square, Circle, Minus, Image, Shapes, Copy } from 'lucide-react';
import { MapObject } from './DraggableObject';
import type { EditorSeat, SeatTypeLite } from './DraggableSeat';
import { MAP_ICONS, getMapIcon } from '@/lib/mapIcons';

// Mantém a mesma forma do TableMapEditorPage original, mas com 'seat' no lugar de 'table'
export type SelectedItem =
  | { type: 'seat'; id: string }
  | { type: 'object'; id: string }
  | null;

interface EditorPropertiesPanelProps {
  seats: EditorSeat[];
  objects: MapObject[];
  seatTypesById: Record<string, SeatTypeLite>;
  selectedItem: SelectedItem;
  readOnly?: boolean;
  onUpdateSeat: (id: string, updates: Partial<EditorSeat>) => void;
  onDeleteSeat: (id: string) => void;
  onUpdateObject: (id: string, updates: Partial<MapObject>) => void;
  onDeleteObject: (id: string) => void;
  onDuplicateSelected?: () => void;
}

export default function EditorPropertiesPanel({
  seats,
  objects,
  seatTypesById,
  selectedItem,
  readOnly = false,
  onUpdateSeat,
  onDeleteSeat,
  onUpdateObject,
  onDeleteObject,
  onDuplicateSelected,
}: EditorPropertiesPanelProps) {
  const totals = useMemo(() => {
    const totalSeats = seats.length;
    const totalCapacity = seats.reduce((sum, s) => {
      const st = seatTypesById[s.seat_type_id];
      const maxCap = s.custom_max_capacity ?? st?.max_capacity ?? 0;
      return sum + maxCap;
    }, 0);
    return { totalSeats, totalCapacity };
  }, [seats, seatTypesById]);

  const selectedSeat = selectedItem?.type === 'seat'
    ? seats.find(s => s.id === selectedItem.id)
    : null;

  const selectedObject = selectedItem?.type === 'object'
    ? objects.find(o => o.id === selectedItem.id)
    : null;

  const seatType = selectedSeat ? seatTypesById[selectedSeat.seat_type_id] : undefined;

  const getObjectTypeLabel = (obj: MapObject): { label: string; icon: React.ReactNode } => {
    if (obj.object_type === 'icon') {
      const IconComp = getMapIcon(obj.text_content || '');
      const iconOption = MAP_ICONS.find(i => i.id === obj.text_content);
      return {
        label: iconOption?.label || 'Ícone',
        icon: IconComp ? <IconComp className="w-4 h-4" /> : <Shapes className="w-4 h-4" />,
      };
    }
    const labels: Record<string, { label: string; icon: React.ReactNode }> = {
      text: { label: 'Texto', icon: <Type className="w-4 h-4" /> },
      rect: { label: 'Retângulo', icon: <Square className="w-4 h-4" /> },
      circle: { label: 'Círculo', icon: <Circle className="w-4 h-4" /> },
      line: { label: 'Linha', icon: <Minus className="w-4 h-4" /> },
      image: { label: 'Imagem', icon: <Image className="w-4 h-4" /> },
    };
    return labels[obj.object_type] || { label: 'Objeto', icon: <Square className="w-4 h-4" /> };
  };

  // Helper: número opcional -> string para input (vazio = herda do tipo)
  const numToInput = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v));
  const inputToNum = (v: string): number | null => (v.trim() === '' ? null : Number(v));

  return (
    <div className="w-64 bg-card border-l p-4 space-y-6 overflow-y-auto">
      {/* Totais */}
      <div className="space-y-3">
        <Label className="text-xs font-semibold uppercase text-muted-foreground">Total</Label>
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center p-3 bg-muted rounded-lg">
            <p className="text-2xl font-bold">{totals.totalSeats}</p>
            <p className="text-xs text-muted-foreground">Assentos</p>
          </div>
          <div className="text-center p-3 bg-muted rounded-lg">
            <p className="text-2xl font-bold">{totals.totalCapacity}</p>
            <p className="text-xs text-muted-foreground">Capacidade</p>
          </div>
        </div>
      </div>

      <Separator />

      {selectedSeat ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold uppercase text-muted-foreground">Propriedades</Label>
            <div className="flex items-center gap-1">
              <Armchair className="w-4 h-4 text-primary" />
              <span className="text-xs">{seatType?.name ?? 'Assento'}</span>
            </div>
          </div>

          <div className="space-y-3">
            {/* Tipo de assento — read-only (decisão: não trocar após criar) */}
            <div>
              <Label className="text-xs">Tipo de Assento</Label>
              <div className="h-8 mt-1 px-3 flex items-center rounded-md border bg-muted/50 text-sm text-muted-foreground">
                {seatType?.name ?? '—'}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                Para mudar o tipo, exclua e crie outro assento.
              </p>
            </div>

            {/* Código — read-only (auto-gerado) */}
            <div>
              <Label className="text-xs">Código</Label>
              <div className="h-8 mt-1 px-3 flex items-center rounded-md border bg-muted/50 text-sm">
                {selectedSeat.code}
              </div>
            </div>

            {/* Label — editável */}
            <div>
              <Label htmlFor="seat_label" className="text-xs">Nome/Etiqueta</Label>
              <Input
                id="seat_label"
                value={selectedSeat.label}
                onChange={(e) => onUpdateSeat(selectedSeat.id, { label: e.target.value })}
                className="h-8 mt-1"
                disabled={readOnly}
              />
            </div>

            {/* Overrides opcionais */}
            <div className="pt-1">
              <Label className="text-[10px] font-semibold uppercase text-muted-foreground">
                Personalizar (opcional)
              </Label>
              <p className="text-[10px] text-muted-foreground mb-2">
                Vazio = usa o padrão do tipo.
              </p>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="cbc" className="text-xs">Cap. base</Label>
                  <Input
                    id="cbc"
                    type="number"
                    min={1}
                    placeholder={String(seatType?.base_capacity ?? '')}
                    value={numToInput(selectedSeat.custom_base_capacity)}
                    onChange={(e) => onUpdateSeat(selectedSeat.id, { custom_base_capacity: inputToNum(e.target.value) })}
                    className="h-8 mt-1"
                    disabled={readOnly}
                  />
                </div>
                <div>
                  <Label htmlFor="cmc" className="text-xs">Cap. máx</Label>
                  <Input
                    id="cmc"
                    type="number"
                    min={1}
                    placeholder={String(seatType?.max_capacity ?? '')}
                    value={numToInput(selectedSeat.custom_max_capacity)}
                    onChange={(e) => onUpdateSeat(selectedSeat.id, { custom_max_capacity: inputToNum(e.target.value) })}
                    className="h-8 mt-1"
                    disabled={readOnly}
                  />
                </div>
                <div>
                  <Label htmlFor="cbp" className="text-xs">Preço base</Label>
                  <Input
                    id="cbp"
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder={String(seatType?.base_price ?? '')}
                    value={numToInput(selectedSeat.custom_base_price)}
                    onChange={(e) => onUpdateSeat(selectedSeat.id, { custom_base_price: inputToNum(e.target.value) })}
                    className="h-8 mt-1"
                    disabled={readOnly}
                  />
                </div>
                <div>
                  <Label htmlFor="cep" className="text-xs">Preço extra</Label>
                  <Input
                    id="cep"
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder={String(seatType?.extra_price ?? '')}
                    value={numToInput(selectedSeat.custom_extra_price)}
                    onChange={(e) => onUpdateSeat(selectedSeat.id, { custom_extra_price: inputToNum(e.target.value) })}
                    className="h-8 mt-1"
                    disabled={readOnly}
                  />
                </div>
              </div>
            </div>

            {/* Dimensões / rotação */}
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label htmlFor="seat_w" className="text-xs">Larg.</Label>
                <Input
                  id="seat_w"
                  type="number"
                  min={20}
                  value={selectedSeat.width}
                  onChange={(e) => onUpdateSeat(selectedSeat.id, { width: parseInt(e.target.value) || 60 })}
                  className="h-8 mt-1"
                  disabled={readOnly}
                />
              </div>
              <div>
                <Label htmlFor="seat_h" className="text-xs">Alt.</Label>
                <Input
                  id="seat_h"
                  type="number"
                  min={20}
                  value={selectedSeat.height}
                  onChange={(e) => onUpdateSeat(selectedSeat.id, { height: parseInt(e.target.value) || 60 })}
                  className="h-8 mt-1"
                  disabled={readOnly}
                />
              </div>
              <div>
                <Label htmlFor="seat_r" className="text-xs">Rot.</Label>
                <Input
                  id="seat_r"
                  type="number"
                  min={0}
                  max={360}
                  value={selectedSeat.rotation}
                  onChange={(e) => onUpdateSeat(selectedSeat.id, { rotation: parseInt(e.target.value) || 0 })}
                  className="h-8 mt-1"
                  disabled={readOnly}
                />
              </div>
            </div>
          </div>

          {!readOnly && (
            <div className="flex gap-2 mt-4">
              {onDuplicateSelected && (
                <Button variant="outline" size="sm" className="flex-1" onClick={onDuplicateSelected} title="Duplicar (Ctrl/Cmd+D)">
                  <Copy className="w-4 h-4 mr-2" />
                  Duplicar
                </Button>
              )}
              <Button variant="destructive" size="sm" className="flex-1" onClick={() => onDeleteSeat(selectedSeat.id)}>
                <Trash2 className="w-4 h-4 mr-2" />
                Excluir
              </Button>
            </div>
          )}
        </div>
      ) : selectedObject ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold uppercase text-muted-foreground">Propriedades</Label>
            <div className="flex items-center gap-1">
              {getObjectTypeLabel(selectedObject).icon}
              <span className="text-xs">{getObjectTypeLabel(selectedObject).label}</span>
            </div>
          </div>

          <div className="space-y-3">
            {selectedObject.object_type === 'icon' && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Largura</Label>
                    <Input type="number" min={20} max={200} value={selectedObject.width}
                      onChange={(e) => onUpdateObject(selectedObject.id, { width: parseInt(e.target.value) || 60 })}
                      className="h-8 mt-1" disabled={readOnly} />
                  </div>
                  <div>
                    <Label className="text-xs">Altura</Label>
                    <Input type="number" min={20} max={200} value={selectedObject.height}
                      onChange={(e) => onUpdateObject(selectedObject.id, { height: parseInt(e.target.value) || 60 })}
                      className="h-8 mt-1" disabled={readOnly} />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Cor do Ícone</Label>
                  <div className="flex gap-2 mt-1">
                    <Input type="color"
                      value={selectedObject.fill_color === 'transparent' ? '#6b7280' : selectedObject.fill_color}
                      onChange={(e) => onUpdateObject(selectedObject.id, { fill_color: e.target.value })}
                      className="h-8 w-12 p-1" disabled={readOnly} />
                    <Input
                      value={selectedObject.fill_color === 'transparent' ? '#6b7280' : selectedObject.fill_color}
                      onChange={(e) => onUpdateObject(selectedObject.id, { fill_color: e.target.value })}
                      className="h-8 flex-1" disabled={readOnly} />
                  </div>
                </div>
              </>
            )}

            {selectedObject.object_type === 'text' && (
              <>
                <div>
                  <Label className="text-xs">Texto</Label>
                  <Input value={selectedObject.text_content || ''}
                    onChange={(e) => onUpdateObject(selectedObject.id, { text_content: e.target.value })}
                    className="h-8 mt-1" disabled={readOnly} />
                </div>
                <div>
                  <Label className="text-xs">Tamanho da Fonte</Label>
                  <Input type="number" min={10} max={72} value={selectedObject.font_size || 16}
                    onChange={(e) => onUpdateObject(selectedObject.id, { font_size: parseInt(e.target.value) || 16 })}
                    className="h-8 mt-1" disabled={readOnly} />
                </div>
                <div>
                  <Label className="text-xs">Cor do Texto</Label>
                  <div className="flex gap-2 mt-1">
                    <Input type="color"
                      value={selectedObject.fill_color === 'transparent' ? '#374151' : selectedObject.fill_color}
                      onChange={(e) => onUpdateObject(selectedObject.id, { fill_color: e.target.value })}
                      className="h-8 w-12 p-1" disabled={readOnly} />
                    <Input
                      value={selectedObject.fill_color === 'transparent' ? '#374151' : selectedObject.fill_color}
                      onChange={(e) => onUpdateObject(selectedObject.id, { fill_color: e.target.value })}
                      className="h-8 flex-1" disabled={readOnly} />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Rotação (graus)</Label>
                  <Input type="number" min={0} max={360} value={selectedObject.rotation}
                    onChange={(e) => onUpdateObject(selectedObject.id, { rotation: parseInt(e.target.value) || 0 })}
                    className="h-8 mt-1" disabled={readOnly} />
                </div>
              </>
            )}

            {(selectedObject.object_type === 'rect' || selectedObject.object_type === 'circle') && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Largura</Label>
                    <Input type="number" min={20} max={500} value={selectedObject.width}
                      onChange={(e) => onUpdateObject(selectedObject.id, { width: parseInt(e.target.value) || 100 })}
                      className="h-8 mt-1" disabled={readOnly} />
                  </div>
                  <div>
                    <Label className="text-xs">Altura</Label>
                    <Input type="number" min={20} max={500} value={selectedObject.height}
                      onChange={(e) => onUpdateObject(selectedObject.id, { height: parseInt(e.target.value) || 80 })}
                      className="h-8 mt-1" disabled={readOnly || selectedObject.object_type === 'circle'} />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Cor de Preenchimento</Label>
                  <div className="flex gap-2 mt-1">
                    <Input type="color" value={selectedObject.fill_color}
                      onChange={(e) => onUpdateObject(selectedObject.id, { fill_color: e.target.value })}
                      className="h-8 w-12 p-1" disabled={readOnly} />
                    <Input value={selectedObject.fill_color}
                      onChange={(e) => onUpdateObject(selectedObject.id, { fill_color: e.target.value })}
                      className="h-8 flex-1" disabled={readOnly} />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Cor da Borda</Label>
                  <div className="flex gap-2 mt-1">
                    <Input type="color" value={selectedObject.stroke_color}
                      onChange={(e) => onUpdateObject(selectedObject.id, { stroke_color: e.target.value })}
                      className="h-8 w-12 p-1" disabled={readOnly} />
                    <Input value={selectedObject.stroke_color}
                      onChange={(e) => onUpdateObject(selectedObject.id, { stroke_color: e.target.value })}
                      className="h-8 flex-1" disabled={readOnly} />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Espessura da Borda</Label>
                  <Input type="number" min={0} max={10} value={selectedObject.stroke_width}
                    onChange={(e) => onUpdateObject(selectedObject.id, { stroke_width: parseFloat(e.target.value) || 1 })}
                    className="h-8 mt-1" disabled={readOnly} />
                </div>
              </>
            )}

            {selectedObject.object_type === 'line' && (
              <>
                <div>
                  <Label className="text-xs">Comprimento</Label>
                  <Input type="number" min={20} max={800} value={selectedObject.width}
                    onChange={(e) => onUpdateObject(selectedObject.id, { width: parseInt(e.target.value) || 100 })}
                    className="h-8 mt-1" disabled={readOnly} />
                </div>
                <div>
                  <Label className="text-xs">Cor da Linha</Label>
                  <div className="flex gap-2 mt-1">
                    <Input type="color" value={selectedObject.stroke_color}
                      onChange={(e) => onUpdateObject(selectedObject.id, { stroke_color: e.target.value })}
                      className="h-8 w-12 p-1" disabled={readOnly} />
                    <Input value={selectedObject.stroke_color}
                      onChange={(e) => onUpdateObject(selectedObject.id, { stroke_color: e.target.value })}
                      className="h-8 flex-1" disabled={readOnly} />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Espessura</Label>
                  <Input type="number" min={1} max={20} value={selectedObject.stroke_width}
                    onChange={(e) => onUpdateObject(selectedObject.id, { stroke_width: parseFloat(e.target.value) || 2 })}
                    className="h-8 mt-1" disabled={readOnly} />
                </div>
                <div>
                  <Label className="text-xs">Rotação (graus)</Label>
                  <Input type="number" min={0} max={360} value={selectedObject.rotation}
                    onChange={(e) => onUpdateObject(selectedObject.id, { rotation: parseInt(e.target.value) || 0 })}
                    className="h-8 mt-1" disabled={readOnly} />
                </div>
              </>
            )}
          </div>

          {!readOnly && (
            <div className="flex gap-2 mt-4">
              {onDuplicateSelected && (
                <Button variant="outline" size="sm" className="flex-1" onClick={onDuplicateSelected} title="Duplicar (Ctrl/Cmd+D)">
                  <Copy className="w-4 h-4 mr-2" />
                  Duplicar
                </Button>
              )}
              <Button variant="destructive" size="sm" className="flex-1" onClick={() => onDeleteObject(selectedObject.id)}>
                <Trash2 className="w-4 h-4 mr-2" />
                Excluir
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          <p className="text-sm">
            {readOnly
              ? 'Mapa em modo leitura (evento publicado).'
              : 'Selecione um assento ou objeto para editar suas propriedades'}
          </p>
        </div>
      )}
    </div>
  );
}
