import { useMemo } from 'react';
import type { EventTableRow } from '@/hooks/useEventTables';
import { isEffectivelyAvailable } from '@/hooks/useEventTables';

/**
 * Planta das unidades do evento para o PRODUTOR.
 *
 * Diferente do mapa do comprador (`components/seated/SeatMapRenderer`), que
 * mostra só o que dá para comprar: aqui a cor é o estado de gestão — vendida no
 * site, fechada por fora, segurada num checkout em andamento, bloqueada. É essa
 * leitura que o produtor abre no celular durante a venda.
 *
 * Desenha a partir de x/y/width/height que vêm da própria RPC de gestão, então
 * não depende do snapshot do mapa nem de o evento estar publicado.
 */

type VisualStatus = 'available' | 'sold' | 'manual' | 'held' | 'blocked';

const CORES: Record<VisualStatus, { fill: string; stroke: string; texto: string; rotulo: string }> = {
  // Cores cravadas de propósito: são semânticas de estado, não o tema da marca.
  // Precisam se distinguir no escuro do painel e continuar legíveis lado a lado.
  available: { fill: '#1E9BF033', stroke: '#1E9BF0', texto: '#BFE3FB', rotulo: 'Disponível' },
  sold:      { fill: '#16A34A',   stroke: '#22C55E', texto: '#04140A', rotulo: 'Vendida no site' },
  manual:    { fill: '#D97706',   stroke: '#F59E0B', texto: '#1A0F00', rotulo: 'Fechada por fora' },
  held:      { fill: '#7C3AED',   stroke: '#A78BFA', texto: '#F2ECFF', rotulo: 'Em checkout' },
  blocked:   { fill: '#3F3F46',   stroke: '#71717A', texto: '#D4D4D8', rotulo: 'Bloqueada' },
};

function statusVisual(t: EventTableRow): VisualStatus {
  // Ordem importa: "held expirado" volta a valer como disponível, igual ao gate
  // do hold_seats — senão o mapa mostra ocupado o que o site já liberou.
  if (isEffectivelyAvailable(t)) return 'available';
  if (t.status === 'sold') return 'sold';
  if (t.status === 'manual') return 'manual';
  if (t.status === 'held') return 'held';
  return 'blocked';
}

interface Props {
  seats: EventTableRow[];
  onSelect: (seat: EventTableRow) => void;
  selectedId?: string | null;
  /**
   * Unidades marcadas para uma venda em lote. O produtor fecha dois, três
   * camarotes numa negociação só — clicar em um de cada vez e mandar dois links
   * é o caminho para o comprador pagar um e esquecer o outro.
   */
  selectedIds?: Set<string>;
  /** `{ "Piso A": 9000 }` — preço de TABELA, de `seat_types`. É fixo: negociar
   *  uma unidade não muda o valor do piso. */
  precoDeTabela?: Record<string, number>;
}

const PAD = 30;

/** Há mais de um tipo de assento em jogo? Só então o mapa ganha cabeçalhos. */
function temGrupos(seats: EventTableRow[]): boolean {
  const nomes = new Set(seats.map((s) => s.seat_type_name).filter(Boolean));
  return nomes.size > 1;
}

export function EventTablesMapView({ seats, onSelect, selectedId, selectedIds, precoDeTabela }: Props) {
  const posicionadas = useMemo(
    () => seats.filter((s) => s.x != null && s.y != null),
    [seats],
  );

  const bbox = useMemo(() => {
    if (posicionadas.length === 0) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const s of posicionadas) {
      const w = s.width ?? (s.radius ? s.radius * 2 : 80);
      const h = s.height ?? (s.radius ? s.radius * 2 : 80);
      minX = Math.min(minX, s.x!);
      minY = Math.min(minY, s.y!);
      maxX = Math.max(maxX, s.x! + w);
      maxY = Math.max(maxY, s.y! + h);
    }
    // Folga extra no topo quando há cabeçalho de grupo, senão o rótulo do piso
    // nasce fora do viewBox e some sem aviso.
    const topo = temGrupos(posicionadas) ? PAD + 46 : PAD;
    return {
      x: minX - PAD,
      y: minY - topo,
      w: maxX - minX + PAD * 2,
      h: maxY - minY + topo + PAD,
    };
  }, [posicionadas]);

  const usadas = useMemo(() => {
    const set = new Set<VisualStatus>();
    for (const s of posicionadas) set.add(statusVisual(s));
    return set;
  }, [posicionadas]);

  /**
   * Cabeçalho de cada agrupamento (no rodeio, os pisos do camarote).
   * Sem isso o produtor vê cinco colunas iguais e não sabe qual é qual — e é
   * justamente o piso que define o preço. Agrupo por `seat_type_name` porque é
   * assim que o sistema já separa preço e rótulo; se o evento não usar tipos
   * distintos, sai um grupo só e nenhum cabeçalho é desenhado.
   */
  const grupos = useMemo(() => {
    const mapa = new Map<string, {
      nome: string; minX: number; maxX: number; minY: number;
      precoMin: number | null; precoMax: number | null;
    }>();
    for (const s of posicionadas) {
      const nome = s.seat_type_name ?? '';
      if (!nome) continue;
      const w = s.width ?? (s.radius ? s.radius * 2 : 80);
      const p = s.base_price;
      const atual = mapa.get(nome);
      if (!atual) {
        mapa.set(nome, { nome, minX: s.x!, maxX: s.x! + w, minY: s.y!, precoMin: p, precoMax: p });
      } else {
        atual.minX = Math.min(atual.minX, s.x!);
        atual.maxX = Math.max(atual.maxX, s.x! + w);
        atual.minY = Math.min(atual.minY, s.y!);
        if (p != null) {
          atual.precoMin = atual.precoMin == null ? p : Math.min(atual.precoMin, p);
          atual.precoMax = atual.precoMax == null ? p : Math.max(atual.precoMax, p);
        }
      }
    }
    return mapa.size > 1 ? [...mapa.values()] : [];
  }, [posicionadas]);

  const moeda = (v: number | null) =>
    v == null || v === 0
      ? null
      : new Intl.NumberFormat('pt-BR', {
          style: 'currency', currency: 'BRL', maximumFractionDigits: 0,
        }).format(v);

  if (posicionadas.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        As unidades deste evento não têm posição no mapa, então não dá para desenhar a planta.
        Use a lista abaixo para gerenciar.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border bg-[#0B0E13] overflow-x-auto">
        <svg
          viewBox={`${bbox!.x} ${bbox!.y} ${bbox!.w} ${bbox!.h}`}
          className="w-full h-auto"
          style={{ minHeight: 260, maxHeight: '62vh' }}
          role="img"
          aria-label={`Planta com ${posicionadas.length} unidades`}
        >
          {grupos.map((g) => {
            const meio = (g.minX + g.maxX) / 2;
            // O cabeçalho mostra o preço de TABELA do piso, que não muda quando
            // uma unidade é negociada. Antes ele exibia o preço da primeira
            // unidade e mudava sozinho a cada venda fechada.
            //
            // Sem a tabela carregada (evento antigo, tipo renomeado), cai na
            // faixa das unidades — que ao menos não elege um preço e mente
            // sobre os outros.
            const daTabela = precoDeTabela?.[g.nome];
            const pMin = moeda(g.precoMin);
            const pMax = moeda(g.precoMax);
            const preco = daTabela != null
              ? moeda(daTabela)
              : (!pMin ? null : (pMin === pMax ? pMin : `${pMin} a ${pMax}`));

            // Quantas unidades saíram da tabela. O preço do piso é FIXO; quando
            // o produtor fecha por menos, aquilo é DESCONTO naquela unidade, não
            // um preço novo do piso (palavra dele, 20/08). Por isso o cabeçalho
            // nunca muda e o que aparece do lado é a contagem de exceções.
            const foraDaTabela = daTabela == null
              ? 0
              : posicionadas.filter(
                  (s) => (s.seat_type_name ?? '') === g.nome && Number(s.base_price ?? 0) !== daTabela,
                ).length;
            return (
              <g key={g.nome}>
                <text
                  x={meio} y={g.minY - 26}
                  textAnchor="middle" fill="#E7ECF3" fontSize={17} fontWeight={700}
                  style={{ fontFamily: 'ui-monospace, monospace', letterSpacing: '0.06em' }}
                >
                  {g.nome.toUpperCase()}
                </text>
                {preco && (
                  <text
                    x={meio} y={g.minY - 10}
                    textAnchor="middle" fill="#8C97A5" fontSize={13}
                    style={{ fontFamily: 'ui-monospace, monospace' }}
                  >
                    {preco}
                    {foraDaTabela > 0 && (
                      <tspan fill="#C9A227">
                        {'  '}· {foraDaTabela} com desconto
                      </tspan>
                    )}
                  </text>
                )}
              </g>
            );
          })}

          {posicionadas.map((s) => {
            const w = s.width ?? (s.radius ? s.radius * 2 : 80);
            const h = s.height ?? (s.radius ? s.radius * 2 : 80);
            const vs = statusVisual(s);
            const c = CORES[vs];
            const noLote = selectedIds?.has(s.id) ?? false;
            const selecionada = selectedId === s.id || noLote;
            // Só escreve o número quando cabe — em planta cheia, texto miúdo
            // vira sujeira e atrapalha mais do que ajuda.
            const cabeTexto = w >= 34 && h >= 16;
            const nome = s.label ?? s.code ?? '';
            const curto = nome.replace(/^\D+/, '') || nome;

            return (
              <g
                key={s.id}
                onClick={() => onSelect(s)}
                style={{ cursor: 'pointer' }}
                role="button"
                tabIndex={0}
                aria-label={`${nome} — ${c.rotulo}`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(s); }
                }}
              >
                <title>{`${nome} — ${c.rotulo}`}</title>
                <rect
                  x={s.x!} y={s.y!} width={w} height={h} rx={4}
                  fill={noLote ? '#7C3AED' : c.fill}
                  stroke={selecionada ? '#FFFFFF' : c.stroke}
                  strokeWidth={selecionada ? 3 : 1.5}
                />
                {cabeTexto && (
                  <text
                    x={s.x! + w / 2}
                    y={s.y! + h / 2}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={Math.min(h * 0.5, 14)}
                    fill={c.texto}
                    fontWeight={600}
                    style={{ pointerEvents: 'none', fontFamily: 'ui-monospace, monospace' }}
                  >
                    {curto}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {(Object.keys(CORES) as VisualStatus[])
          .filter((k) => usadas.has(k))
          .map((k) => (
            <span key={k} className="flex items-center gap-2 text-xs text-muted-foreground">
              <span
                className="w-3.5 h-3.5 rounded-sm border"
                style={{ background: CORES[k].fill, borderColor: CORES[k].stroke }}
              />
              {CORES[k].rotulo}
            </span>
          ))}
        <span className="text-xs text-muted-foreground ml-auto">
          Toque numa unidade para ver os detalhes
        </span>
      </div>
    </div>
  );
}
