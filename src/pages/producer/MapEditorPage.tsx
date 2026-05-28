import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import { ArrowLeft, Save, Loader2, RotateCw, Lock } from 'lucide-react';
import EditorToolbar from '@/components/producer/map-editor/EditorToolbar';
import EditorCanvas, { sKey, oKey, type SelectionKey } from '@/components/producer/map-editor/EditorCanvas';
import EditorPropertiesPanel, { type SelectedItem } from '@/components/producer/map-editor/EditorPropertiesPanel';
import { MapObject } from '@/components/producer/map-editor/DraggableObject';
import type { EditorSeat, SeatTypeLite } from '@/components/producer/map-editor/DraggableSeat';
import { useSeatTypes } from '@/hooks/useSeatTypes';

interface TableMap {
  id: string;
  venue_id: string;
  name: string;
  description: string | null;
  canvas_width: number;
  canvas_height: number;
  background_color: string;
  orientation?: 'landscape' | 'portrait' | null;
}

export default function MapEditorPage() {
  const { venueId, mapId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [mapName, setMapName] = useState('');
  const [backgroundColor, setBackgroundColor] = useState('#f5f5f5');
  const [canvasWidth, setCanvasWidth] = useState(1200);
  const [canvasHeight, setCanvasHeight] = useState(800);
  const [orientation, setOrientation] = useState<'landscape' | 'portrait'>('landscape');
  const [seats, setSeats] = useState<EditorSeat[]>([]);
  const [objects, setObjects] = useState<MapObject[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<SelectionKey>>(new Set());
  const [hasChanges, setHasChanges] = useState(false);

  const dragSnapshot = useRef<Map<SelectionKey, { x: number; y: number }> | null>(null);
  const seatsRef = useRef<EditorSeat[]>([]);
  const objectsRef = useRef<MapObject[]>([]);
  useEffect(() => { seatsRef.current = seats; }, [seats]);
  useEffect(() => { objectsRef.current = objects; }, [objects]);

  // seat_types from producer
  const { seatTypes: rawSeatTypes } = useSeatTypes();
  const seatTypesList: SeatTypeLite[] = useMemo(
    () => (rawSeatTypes ?? [])
      .filter((st) => st.is_active !== false)
      .map((st) => ({
        id: st.id,
        name: st.name,
        base_capacity: st.base_capacity,
        max_capacity: st.max_capacity,
        base_price: Number(st.base_price ?? 0),
        extra_price: Number(st.extra_price ?? 0),
        shape: (st.shape as 'rect' | 'circle') ?? 'rect',
        default_color: st.default_color ?? '#6366f1',
        default_width: st.default_width ?? 80,
        default_height: st.default_height ?? 80,
      })),
    [rawSeatTypes]
  );
  const seatTypesById = useMemo(
    () => Object.fromEntries(seatTypesList.map((st) => [st.id, st])) as Record<string, SeatTypeLite>,
    [seatTypesList]
  );

  // Derive single-selection item for properties panel
  const selectedItem: SelectedItem = useMemo(() => {
    if (selectedIds.size !== 1) return null;
    const key = Array.from(selectedIds)[0];
    if (key.startsWith('s:')) return { type: 'seat', id: key.slice(2) };
    if (key.startsWith('o:')) return { type: 'object', id: key.slice(2) };
    return null;
  }, [selectedIds]);

  // Fetch map
  const { data: mapData, isLoading: isLoadingMap } = useQuery({
    queryKey: ['table-map', mapId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('table_maps').select('*').eq('id', mapId!).single();
      if (error) throw error;
      return data as unknown as TableMap;
    },
    enabled: !!mapId,
  });

  // Fetch seats
  const { data: mapSeats, isLoading: isLoadingSeats } = useQuery({
    queryKey: ['venue-seats', mapId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('venue_seats').select('*')
        .eq('table_map_id', mapId!).eq('is_active', true).order('code');
      if (error) throw error;
      return data;
    },
    enabled: !!mapId,
  });

  // Fetch objects
  const { data: mapObjects, isLoading: isLoadingObjects } = useQuery({
    queryKey: ['map-objects', mapId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('map_objects').select('*')
        .eq('table_map_id', mapId!).eq('is_active', true);
      if (error) throw error;
      return data;
    },
    enabled: !!mapId,
  });

  // Read-only check: any published event using this map?
  const { data: publishedEvent } = useQuery({
    queryKey: ['map-published-event', mapId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('events').select('id, title')
        .eq('table_map_id', mapId!).eq('status', 'published').limit(1).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!mapId,
  });

  const isReadOnly = !!publishedEvent;

  // Initialize from fetched data
  useEffect(() => {
    if (mapData) {
      setMapName(mapData.name);
      setBackgroundColor(mapData.background_color);
      setCanvasWidth(mapData.canvas_width || 1200);
      setCanvasHeight(mapData.canvas_height || 800);
      setOrientation((mapData.orientation as 'landscape' | 'portrait') || 'landscape');
    }
  }, [mapData]);

  useEffect(() => {
    if (mapSeats) {
      setSeats(mapSeats.map((s: any) => ({
        id: s.id,
        seat_type_id: s.seat_type_id,
        code: s.code,
        label: s.label ?? s.code,
        x: s.x,
        y: s.y,
        width: s.width ?? 80,
        height: s.height ?? 80,
        rotation: s.rotation ?? 0,
        custom_base_capacity: s.custom_base_capacity,
        custom_max_capacity: s.custom_max_capacity,
        custom_base_price: s.custom_base_price !== null && s.custom_base_price !== undefined ? Number(s.custom_base_price) : null,
        custom_extra_price: s.custom_extra_price !== null && s.custom_extra_price !== undefined ? Number(s.custom_extra_price) : null,
      })));
    }
  }, [mapSeats]);

  useEffect(() => {
    if (mapObjects) {
      setObjects(mapObjects.map((o: any) => ({
        id: o.id,
        table_map_id: o.table_map_id,
        object_type: o.object_type as MapObject['object_type'],
        x: o.x,
        y: o.y,
        width: o.width ?? 100,
        height: o.height ?? 80,
        rotation: o.rotation ?? 0,
        text_content: o.text_content ?? '',
        font_size: o.font_size ?? 16,
        fill_color: o.fill_color ?? '#e5e7eb',
        stroke_color: o.stroke_color ?? '#9ca3af',
        stroke_width: o.stroke_width ?? 1,
      })));
    }
  }, [mapObjects]);

  // Generate unique code per seat_type (1st letter of name uppercased)
  const generateCode = (seatType: SeatTypeLite) => {
    const letter = (seatType.name.trim()[0] || 'S').toUpperCase();
    const prefix = /[A-Z]/.test(letter) ? letter : 'S';
    const existingNums = seatsRef.current
      .filter((s) => s.code.startsWith(prefix))
      .map((s) => parseInt(s.code.slice(prefix.length), 10) || 0);
    const next = existingNums.length > 0 ? Math.max(...existingNums) + 1 : 1;
    return `${prefix}${next.toString().padStart(2, '0')}`;
  };

  const handleAddSeat = useCallback((seatTypeId: string) => {
    const st = seatTypesById[seatTypeId];
    if (!st) {
      toast({ title: 'Tipo de assento não encontrado', variant: 'destructive' });
      return;
    }
    const code = generateCode(st);
    const w = st.default_width || 80;
    const h = st.default_height || 80;
    const newSeat: EditorSeat = {
      id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      seat_type_id: st.id,
      code,
      label: `${st.name} ${code.slice(1)}`,
      x: Math.round(canvasWidth / 2 - w / 2),
      y: Math.round(canvasHeight / 2 - h / 2),
      width: w,
      height: h,
      rotation: 0,
      custom_base_capacity: null,
      custom_max_capacity: null,
      custom_base_price: null,
      custom_extra_price: null,
    };
    setSeats((prev) => [...prev, newSeat]);
    setSelectedIds(new Set([sKey(newSeat.id)]));
    setHasChanges(true);
  }, [seatTypesById, canvasWidth, canvasHeight]);

  const handleAddShape = useCallback((shapeType: 'rect' | 'circle' | 'text' | 'line') => {
    const defaults: Record<string, Partial<MapObject>> = {
      text: { width: 150, height: 30, fill_color: 'transparent', stroke_color: 'transparent', stroke_width: 0, text_content: 'TEXTO', font_size: 16 },
      rect: { width: 100, height: 80, fill_color: '#e5e7eb', stroke_color: '#9ca3af', stroke_width: 1 },
      circle: { width: 80, height: 80, fill_color: '#e5e7eb', stroke_color: '#9ca3af', stroke_width: 1 },
      line: { width: 100, height: 2, fill_color: 'transparent', stroke_color: '#6b7280', stroke_width: 2 },
    };
    const d = defaults[shapeType];
    const newObject: MapObject = {
      id: `temp-${Date.now()}`,
      object_type: shapeType,
      x: canvasWidth / 2 - 50,
      y: canvasHeight / 2 - 40,
      width: d.width || 100,
      height: d.height || 80,
      rotation: 0,
      text_content: d.text_content,
      font_size: d.font_size,
      fill_color: d.fill_color || '#e5e7eb',
      stroke_color: d.stroke_color || '#9ca3af',
      stroke_width: d.stroke_width || 1,
    };
    setObjects((prev) => [...prev, newObject]);
    setSelectedIds(new Set([oKey(newObject.id)]));
    setHasChanges(true);
  }, [canvasWidth, canvasHeight]);

  const handleAddIcon = useCallback((iconId: string) => {
    const newObject: MapObject = {
      id: `temp-${Date.now()}`,
      object_type: 'icon',
      x: canvasWidth / 2 - 30,
      y: canvasHeight / 2 - 30,
      width: 60,
      height: 60,
      rotation: 0,
      text_content: iconId,
      fill_color: '#6b7280',
      stroke_color: 'transparent',
      stroke_width: 0,
    };
    setObjects((prev) => [...prev, newObject]);
    setSelectedIds(new Set([oKey(newObject.id)]));
    setHasChanges(true);
  }, [canvasWidth, canvasHeight]);

  const handleUpdateSeat = useCallback((id: string, updates: Partial<EditorSeat>) => {
    // Defensive: never allow changing seat_type_id (decision: read-only post-create).
    const { seat_type_id: _ignored, ...safe } = updates;
    setSeats((prev) => prev.map((s) => (s.id === id ? { ...s, ...safe } : s)));
    setHasChanges(true);
  }, []);

  const handleDeleteSeat = useCallback((id: string) => {
    setSeats((prev) => prev.filter((s) => s.id !== id));
    setSelectedIds(new Set());
    setHasChanges(true);
  }, []);

  const handleUpdateObjectPosition = useCallback((id: string, x: number, y: number) => {
    setObjects((prev) => prev.map((o) => (o.id === id ? { ...o, x: Math.round(x), y: Math.round(y) } : o)));
    setHasChanges(true);
  }, []);

  const handleUpdateObjectSize = useCallback((id: string, width: number, height: number) => {
    setObjects((prev) => prev.map((o) => (o.id === id ? { ...o, width: Math.round(width), height: Math.round(height) } : o)));
    setHasChanges(true);
  }, []);

  const handleUpdateObject = useCallback((id: string, updates: Partial<MapObject>) => {
    setObjects((prev) => prev.map((o) => (o.id === id ? { ...o, ...updates } : o)));
    setHasChanges(true);
  }, []);

  const handleDeleteObject = useCallback((id: string) => {
    setObjects((prev) => prev.filter((o) => o.id !== id));
    setSelectedIds(new Set());
    setHasChanges(true);
  }, []);

  // ---- Group drag ----
  const handleBeginGroupDrag = useCallback(() => {
    const snapMap = new Map<SelectionKey, { x: number; y: number }>();
    selectedIds.forEach((key) => {
      if (key.startsWith('s:')) {
        const s = seatsRef.current.find((x) => x.id === key.slice(2));
        if (s) snapMap.set(key, { x: s.x, y: s.y });
      } else if (key.startsWith('o:')) {
        const o = objectsRef.current.find((x) => x.id === key.slice(2));
        if (o) snapMap.set(key, { x: o.x, y: o.y });
      }
    });
    dragSnapshot.current = snapMap;
  }, [selectedIds]);

  const handleApplyGroupDelta = useCallback((dx: number, dy: number) => {
    const snapMap = dragSnapshot.current;
    if (!snapMap || snapMap.size === 0) return;
    let cdx = dx, cdy = dy;
    snapMap.forEach((start, key) => {
      if (key.startsWith('s:')) {
        const s = seatsRef.current.find((x) => x.id === key.slice(2));
        if (!s) return;
        cdx = Math.max(cdx, -start.x);
        cdy = Math.max(cdy, -start.y);
        cdx = Math.min(cdx, canvasWidth - s.width - start.x);
        cdy = Math.min(cdy, canvasHeight - s.height - start.y);
      } else if (key.startsWith('o:')) {
        const o = objectsRef.current.find((x) => x.id === key.slice(2));
        if (!o) return;
        cdx = Math.max(cdx, -start.x);
        cdy = Math.max(cdy, -start.y);
        cdx = Math.min(cdx, canvasWidth - o.width - start.x);
        cdy = Math.min(cdy, canvasHeight - o.height - start.y);
      }
    });
    setSeats((prev) => prev.map((s) => {
      const start = snapMap.get(sKey(s.id));
      return start ? { ...s, x: Math.round(start.x + cdx), y: Math.round(start.y + cdy) } : s;
    }));
    setObjects((prev) => prev.map((o) => {
      const start = snapMap.get(oKey(o.id));
      return start ? { ...o, x: Math.round(start.x + cdx), y: Math.round(start.y + cdy) } : o;
    }));
    setHasChanges(true);
  }, [canvasWidth, canvasHeight]);

  const handleDeleteSelected = useCallback(() => {
    if (selectedIds.size === 0) return;
    const seatIds = new Set<string>();
    const objIds = new Set<string>();
    selectedIds.forEach((k) => {
      if (k.startsWith('s:')) seatIds.add(k.slice(2));
      else if (k.startsWith('o:')) objIds.add(k.slice(2));
    });
    if (seatIds.size) setSeats((prev) => prev.filter((s) => !seatIds.has(s.id)));
    if (objIds.size) setObjects((prev) => prev.filter((o) => !objIds.has(o.id)));
    setSelectedIds(new Set());
    setHasChanges(true);
  }, [selectedIds]);

  const handleDuplicateSelected = useCallback(() => {
    if (selectedIds.size === 0) return;
    const OFFSET = 20;
    const newId = () => `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const clampX = (x: number, w: number) => Math.max(0, Math.min(canvasWidth - w, x));
    const clampY = (y: number, h: number) => Math.max(0, Math.min(canvasHeight - h, y));

    const newSelection = new Set<SelectionKey>();
    const newSeats: EditorSeat[] = [];
    const newObjects: MapObject[] = [];
    const workingSeats = [...seatsRef.current];

    const nextCodeFor = (seatTypeId: string) => {
      const st = seatTypesById[seatTypeId];
      const letter = (st?.name.trim()[0] || 'S').toUpperCase();
      const prefix = /[A-Z]/.test(letter) ? letter : 'S';
      const nums = workingSeats
        .filter((s) => s.code.startsWith(prefix))
        .map((s) => parseInt(s.code.slice(prefix.length), 10) || 0);
      const n = nums.length ? Math.max(...nums) + 1 : 1;
      return { prefix, code: `${prefix}${n.toString().padStart(2, '0')}` };
    };

    selectedIds.forEach((key) => {
      if (key.startsWith('s:')) {
        const s = seatsRef.current.find((x) => x.id === key.slice(2));
        if (!s) return;
        const { code } = nextCodeFor(s.seat_type_id);
        const st = seatTypesById[s.seat_type_id];
        const copy: EditorSeat = {
          ...s,
          id: newId(),
          code,
          label: `${st?.name ?? 'Assento'} ${code.replace(/^[A-Z]/, '')}`,
          x: clampX(s.x + OFFSET, s.width),
          y: clampY(s.y + OFFSET, s.height),
        };
        workingSeats.push(copy);
        newSeats.push(copy);
        newSelection.add(sKey(copy.id));
      } else if (key.startsWith('o:')) {
        const o = objectsRef.current.find((x) => x.id === key.slice(2));
        if (!o) return;
        const copy: MapObject = {
          ...o,
          id: newId(),
          x: clampX(o.x + OFFSET, o.width),
          y: clampY(o.y + OFFSET, o.height),
        };
        newObjects.push(copy);
        newSelection.add(oKey(copy.id));
      }
    });

    if (newSeats.length) setSeats((prev) => [...prev, ...newSeats]);
    if (newObjects.length) setObjects((prev) => [...prev, ...newObjects]);
    if (newSelection.size) {
      setSelectedIds(newSelection);
      setHasChanges(true);
    }
  }, [selectedIds, canvasWidth, canvasHeight, seatTypesById]);

  // ---- Rotação do mapa inteiro (90° anti-horário) ----
  const handleRotateMap = useCallback(() => {
    const nextOrientation = orientation === 'landscape' ? 'portrait' : 'landscape';
    const msg = `Girar o mapa 90°? Todos os elementos serão reposicionados (${orientation === 'landscape' ? 'Paisagem → Retrato' : 'Retrato → Paisagem'}). Você ainda precisará clicar em Salvar para confirmar.`;
    if (!window.confirm(msg)) return;

    const W = canvasWidth;
    setSeats((prev) => prev.map((s) => ({
      ...s,
      x: Math.round(s.y),
      y: Math.round(W - s.x - s.width),
      width: s.height,
      height: s.width,
      rotation: ((s.rotation || 0) + 270) % 360,
    })));
    setObjects((prev) => prev.map((o) => ({
      ...o,
      x: Math.round(o.y),
      y: Math.round(W - o.x - o.width),
      width: o.height,
      height: o.width,
      rotation: ((o.rotation || 0) + 270) % 360,
    })));
    setCanvasWidth(canvasHeight);
    setCanvasHeight(W);
    setOrientation(nextOrientation);
    setSelectedIds(new Set());
    setHasChanges(true);
    toast({ title: `Mapa girado para ${nextOrientation === 'portrait' ? 'Retrato' : 'Paisagem'}`, description: 'Lembre-se de salvar.' });
  }, [orientation, canvasWidth, canvasHeight]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!mapId || !mapData) throw new Error('Mapa não encontrado');
      if (isReadOnly) throw new Error('Mapa em modo somente-leitura (evento publicado).');

      const { error: mapError } = await supabase
        .from('table_maps')
        .update({
          name: mapName,
          background_color: backgroundColor,
          canvas_width: canvasWidth,
          canvas_height: canvasHeight,
          orientation,
          updated_at: new Date().toISOString(),
        } as never)
        .eq('id', mapId);
      if (mapError) throw mapError;

      // --- SEATS ---
      const insertedSeatIds: string[] = [];
      const existingSeatIdsToKeep: string[] = [];

      for (const seat of seats) {
        const seatPayload = {
          venue_id: mapData.venue_id,
          table_map_id: mapId,
          seat_type_id: seat.seat_type_id,
          code: seat.code,
          label: seat.label,
          x: seat.x,
          y: seat.y,
          width: seat.width,
          height: seat.height,
          rotation: seat.rotation,
          custom_base_capacity: seat.custom_base_capacity,
          custom_max_capacity: seat.custom_max_capacity,
          custom_base_price: seat.custom_base_price,
          custom_extra_price: seat.custom_extra_price,
          is_active: true,
        };

        if (seat.id.startsWith('temp-')) {
          const { data, error } = await supabase
            .from('venue_seats').insert(seatPayload as never).select('id').single();
          if (error) throw error;
          if (data) insertedSeatIds.push((data as any).id);
        } else {
          existingSeatIdsToKeep.push(seat.id);
          const { error } = await supabase
            .from('venue_seats').update(seatPayload as never).eq('id', seat.id);
          if (error) throw error;
        }
      }

      const allCurrentSeatIds = [...existingSeatIdsToKeep, ...insertedSeatIds];
      const existingSeatIds = (mapSeats ?? []).map((s: any) => s.id);
      const deletedSeatIds = existingSeatIds.filter((id) => !allCurrentSeatIds.includes(id));
      if (deletedSeatIds.length > 0) {
        const { error } = await supabase
          .from('venue_seats').update({ is_active: false } as never).in('id', deletedSeatIds);
        if (error) throw error;
      }

      // --- OBJECTS ---
      const insertedObjectIds: string[] = [];
      const existingObjectIdsToKeep: string[] = [];

      for (const obj of objects) {
        const objectData = {
          table_map_id: mapId,
          object_type: obj.object_type,
          x: obj.x,
          y: obj.y,
          width: obj.width,
          height: obj.height,
          rotation: obj.rotation,
          text_content: obj.text_content,
          font_size: obj.font_size,
          fill_color: obj.fill_color,
          stroke_color: obj.stroke_color,
          stroke_width: obj.stroke_width,
          is_active: true,
        };

        if (obj.id.startsWith('temp-')) {
          const { data, error } = await supabase
            .from('map_objects').insert(objectData as never).select('id').single();
          if (error) throw error;
          if (data) insertedObjectIds.push((data as any).id);
        } else {
          existingObjectIdsToKeep.push(obj.id);
          const { error } = await supabase
            .from('map_objects').update(objectData as never).eq('id', obj.id);
          if (error) throw error;
        }
      }

      const allCurrentObjectIds = [...existingObjectIdsToKeep, ...insertedObjectIds];
      const existingObjectIds = (mapObjects ?? []).map((o: any) => o.id);
      const deletedObjectIds = existingObjectIds.filter((id) => !allCurrentObjectIds.includes(id));
      if (deletedObjectIds.length > 0) {
        const { error } = await supabase
          .from('map_objects').update({ is_active: false } as never).in('id', deletedObjectIds);
        if (error) throw error;
      }
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['venue-seats', mapId] });
      queryClient.invalidateQueries({ queryKey: ['map-objects', mapId] });
      queryClient.invalidateQueries({ queryKey: ['table-maps'] });

      // Re-fetch with real IDs
      const { data: freshSeats } = await supabase
        .from('venue_seats').select('*')
        .eq('table_map_id', mapId!).eq('is_active', true).order('code');
      if (freshSeats) {
        setSeats(freshSeats.map((s: any) => ({
          id: s.id,
          seat_type_id: s.seat_type_id,
          code: s.code,
          label: s.label ?? s.code,
          x: s.x,
          y: s.y,
          width: s.width ?? 80,
          height: s.height ?? 80,
          rotation: s.rotation ?? 0,
          custom_base_capacity: s.custom_base_capacity,
          custom_max_capacity: s.custom_max_capacity,
          custom_base_price: s.custom_base_price !== null && s.custom_base_price !== undefined ? Number(s.custom_base_price) : null,
          custom_extra_price: s.custom_extra_price !== null && s.custom_extra_price !== undefined ? Number(s.custom_extra_price) : null,
        })));
      }

      const { data: freshObjects } = await supabase
        .from('map_objects').select('*')
        .eq('table_map_id', mapId!).eq('is_active', true);
      if (freshObjects) {
        setObjects(freshObjects.map((o: any) => ({
          id: o.id,
          table_map_id: o.table_map_id,
          object_type: o.object_type as MapObject['object_type'],
          x: o.x,
          y: o.y,
          width: o.width ?? 100,
          height: o.height ?? 80,
          rotation: o.rotation ?? 0,
          text_content: o.text_content ?? '',
          font_size: o.font_size ?? 16,
          fill_color: o.fill_color ?? '#e5e7eb',
          stroke_color: o.stroke_color ?? '#9ca3af',
          stroke_width: o.stroke_width ?? 1,
        })));
      }

      toast({ title: 'Mapa salvo com sucesso!' });
      setHasChanges(false);
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
    },
  });

  if (isLoadingMap || isLoadingSeats || isLoadingObjects) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-card">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(`/produtor/locais/${venueId}/mapas`)}
            title="Voltar para mapas"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <Input
            value={mapName}
            onChange={(e) => { setMapName(e.target.value); setHasChanges(true); }}
            className="w-64 font-semibold"
            placeholder="Nome do mapa"
            disabled={isReadOnly}
          />
        </div>
        <div className="flex items-center gap-2">
          {hasChanges && !isReadOnly && (
            <span className="text-sm text-muted-foreground">Alterações não salvas</span>
          )}
          {!isReadOnly && (
            <>
              <Button
                variant="outline"
                onClick={handleRotateMap}
                title={`Orientação atual: ${orientation === 'portrait' ? 'Retrato' : 'Paisagem'}. Clique para girar 90°.`}
              >
                <RotateCw className="w-4 h-4 mr-2" />
                Girar 90° ({orientation === 'portrait' ? 'Retrato' : 'Paisagem'})
              </Button>
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || !hasChanges}
              >
                {saveMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Salvar
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Read-only banner */}
      {isReadOnly && (
        <div className="flex items-center gap-2 px-4 py-2 bg-yellow-100 dark:bg-yellow-950/40 border-b border-yellow-300 dark:border-yellow-800 text-yellow-900 dark:text-yellow-200 text-sm">
          <Lock className="w-4 h-4 flex-shrink-0" />
          <span>
            Mapa em modo somente-leitura — está em uso pelo evento publicado
            {publishedEvent?.title ? <strong> “{publishedEvent.title}”</strong> : null}.
            Para editar, despublique o evento ou crie um novo mapa.
          </span>
        </div>
      )}

      {/* Editor */}
      <div className="flex-1 flex overflow-hidden">
        {!isReadOnly && (
          <EditorToolbar
            seatTypes={seatTypesList}
            onAddSeat={handleAddSeat}
            onAddShape={handleAddShape}
            onAddIcon={handleAddIcon}
            backgroundColor={backgroundColor}
            onBackgroundColorChange={(c) => { setBackgroundColor(c); setHasChanges(true); }}
          />
        )}
        <EditorCanvas
          seats={seats}
          objects={objects}
          seatTypesById={seatTypesById}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          onBeginGroupDrag={handleBeginGroupDrag}
          onApplyGroupDelta={handleApplyGroupDelta}
          onUpdateObjectSize={handleUpdateObjectSize}
          onUpdateObjectPosition={handleUpdateObjectPosition}
          onDeleteSelected={handleDeleteSelected}
          onDuplicateSelected={handleDuplicateSelected}
          canvasWidth={canvasWidth}
          canvasHeight={canvasHeight}
          backgroundColor={backgroundColor}
          readOnly={isReadOnly}
        />
        <EditorPropertiesPanel
          seats={seats}
          objects={objects}
          seatTypesById={seatTypesById}
          selectedItem={selectedItem}
          readOnly={isReadOnly}
          onUpdateSeat={handleUpdateSeat}
          onDeleteSeat={handleDeleteSeat}
          onUpdateObject={handleUpdateObject}
          onDeleteObject={handleDeleteObject}
          onDuplicateSelected={handleDuplicateSelected}
        />
      </div>
    </div>
  );
}
