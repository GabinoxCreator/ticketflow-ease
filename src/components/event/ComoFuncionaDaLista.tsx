// "Como funciona" na página do evento com lista de alunos (OS-365, Balé).
//
// Um caminho de cima para baixo que vai aparecendo enquanto a família rola a
// tela: a linha se desenha com a rolagem e cada passo entra quando chega na
// vista. Só aparece em evento com lista (evento_lista_info). Textos aprovados
// pelo Gabriel em 03/11 (os mesmos da janela "Como funciona" da entrada).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import { Link } from 'react-router-dom';
import { motion, useScroll, useSpring } from 'framer-motion';
import { ArrowRight, Armchair, CalendarCheck, CreditCard, IdCard, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { horaCurta } from '@/lib/eventTime';
import { useListaDoEvento } from '@/hooks/useListaDeAlunos';
import { useEventSeats, type EventSeatRow } from '@/hooks/useEventSeats';
import { SeatMapRenderer } from '@/components/seated/SeatMapRenderer';
import type { VStatus } from '@/components/seated/SeatNode';


/** O mapa de verdade do teatro, pequeno e só para olhar (o toque não escolhe nada). */
function MapaDeExemplo({ eventId, snapshot }: { eventId: string; snapshot: unknown }) {
  const { data: seats } = useEventSeats(eventId);
  // De exemplo, as duas poltronas livres mais perto do centro do mapa, lado a lado.
  const exemplo = useMemo(() => {
    const livres = (seats ?? []).filter((x) => x.status === 'available' && x.x != null && x.y != null);
    if (!livres.length) return new Set<string>();
    const xs = livres.map((x) => x.x as number); const ys = livres.map((x) => x.y as number);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2; const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const perto = [...livres].sort((a, b) => Math.hypot((a.x as number) - cx, (a.y as number) - cy) - Math.hypot((b.x as number) - cx, (b.y as number) - cy));
    const primeira = perto[0];
    const vizinha = perto.slice(1).filter((x) => Math.abs((x.y as number) - (primeira.y as number)) < 10)
      .sort((a, b) => Math.abs((a.x as number) - (primeira.x as number)) - Math.abs((b.x as number) - (primeira.x as number)))[0];
    return new Set([primeira.id, vizinha?.id].filter(Boolean) as string[]);
  }, [seats]);
  const status = useCallback((s: EventSeatRow): VStatus => {
    // fora da venda aparece "Em uso", igual ao mapa da compra (decisão de 03/11)
    if (s.status === 'blocked' || s.status === 'held') return 'held-other';
    if (s.status === 'sold' || s.status === 'manual') return 'sold';
    return exemplo.has(s.id) ? 'selected-mine' : 'available';
  }, [exemplo]);
  if (!seats?.length) return null;
  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-border/60 bg-white">
      <div className="pointer-events-none h-52" aria-hidden="true">
        <SeatMapRenderer
          snapshot={snapshot as Parameters<typeof SeatMapRenderer>[0]['snapshot']}
          seats={seats}
          resolveVisualStatus={status}
          onToggleSeat={() => undefined}
          fillHeight
        />
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-border/60 px-3 py-2 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-[hsl(var(--seat-available))]" />Disponível</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-[hsl(var(--seat-selected))]" />Sua escolha</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-[hsl(var(--seat-held))]" />Em uso</span>
      </div>
    </div>
  );
}

interface Props {
  eventId: string;
  eventSlugOrId: string;
  /** O desenho do mapa do evento (events.map_snapshot), para o exemplo do passo 3. */
  mapSnapshot?: unknown;
}

/** A linha que se desenha com a rolagem. Só monta com o caminho já na tela: o
 *  `useScroll` do framer-motion lê o alvo uma vez só, ao montar. */
function LinhaDoCaminho({ caminho }: { caminho: React.RefObject<HTMLDivElement> }) {
  const { scrollYProgress } = useScroll({ target: caminho, offset: ['start 80%', 'end 60%'] });
  const linha = useSpring(scrollYProgress, { stiffness: 120, damping: 30 });
  return (
    <motion.div
      className="absolute bottom-6 left-[21px] top-6 w-0.5 origin-top rounded-full bg-gradient-to-b from-[#7c3aed] via-[#c026d3] to-[#ec4899]"
      style={{ scaleY: linha }}
      aria-hidden="true"
      data-linha-do-caminho
    />
  );
}

export function ComoFuncionaDaLista({ eventId, eventSlugOrId, mapSnapshot }: Props) {
  const { data: lista } = useListaDoEvento(eventId);
  if (!lista?.tem_lista) return null;
  return <Caminho eventId={eventId} eventSlugOrId={eventSlugOrId} mapSnapshot={mapSnapshot} lista={lista} />;
}

function Caminho({ eventId, eventSlugOrId, mapSnapshot, lista }: Props & { lista: NonNullable<ReturnType<typeof useListaDoEvento>['data']> }) {
  const caminho = useRef<HTMLDivElement>(null);
  const [montado, setMontado] = useState(false);
  useEffect(() => { setMontado(true); }, []);
  const limite = lista.limite_por_aluno ?? 4;
  const sessoes = lista.sessoes ?? [];

  const passos = [
    {
      icone: IdCard,
      titulo: 'Informe o CPF do aluno',
      texto: 'Os convites são só para as famílias dos alunos da escola. O CPF confirma que o aluno está na lista e mostra quantos convites ele ainda tem.',
      extra: (
        <p className="mt-3 inline-flex items-start gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          O CPF do aluno serve só para conferir a lista. Ele não vai no seu pedido nem no convite.
        </p>
      ),
    },
    {
      icone: CalendarCheck,
      titulo: 'Escolha a sessão',
      texto: 'Cada aluno compra só na sessão em que dança.',
      extra: sessoes.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {sessoes.map((s) => (
            <span key={s.event_id} className="rounded-full border border-primary/25 bg-primary/5 px-3 py-1 text-xs font-medium">
              {s.sessao}ª sessão · {horaCurta(s.time)}
            </span>
          ))}
        </div>
      ),
    },
    {
      icone: Armchair,
      titulo: 'Escolha as poltronas',
      texto: `Toque nas poltronas livres no mapa, até ${limite} por aluno, somando as sessões. Elas ficam reservadas por 10 minutos enquanto você paga.`,
      extra: mapSnapshot ? <MapaDeExemplo eventId={eventId} snapshot={mapSnapshot} /> : null,
    },
    {
      icone: CreditCard,
      titulo: 'Pague por PIX ou cartão',
      texto: 'Os convites aparecem em Meus Ingressos, com a sessão e a poltrona.',
      extra: null,
    },
  ];

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="space-y-5"
    >
      <div>
        <h2 className="font-display text-xl font-bold">Como funciona</h2>
        <p className="text-sm text-muted-foreground">Leva menos de 2 minutos.</p>
      </div>

      <div ref={caminho} className="relative pl-14">
        {/* A linha do caminho: o trilho e o que já foi percorrido na rolagem */}
        <div className="absolute bottom-6 left-[21px] top-6 w-0.5 rounded-full bg-border" aria-hidden="true" />
        {montado && <LinhaDoCaminho caminho={caminho} />}
        <ol className="space-y-5">
          {passos.map((p, i) => (
            <motion.li
              key={p.titulo}
              initial={{ opacity: 0, x: 24 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.45, ease: 'easeOut' }}
              className="relative"
            >
              <motion.span
                className="absolute -left-14 top-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#7c3aed] to-[#ec4899] text-white shadow-lg shadow-fuchsia-500/25"
                initial={{ scale: 0.6, rotate: -12 }}
                whileInView={{ scale: 1, rotate: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ type: 'spring', stiffness: 260, damping: 16 }}
              >
                <p.icone className="h-5 w-5" />
              </motion.span>
              <div className="rounded-2xl border border-border/60 bg-card/70 p-4 backdrop-blur-xl shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">Passo {i + 1}</p>
                <p className="mt-0.5 font-display text-base font-semibold">{p.titulo}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{p.texto}</p>
                {p.extra}
              </div>
            </motion.li>
          ))}
        </ol>
      </div>

      <Button asChild variant="hero" size="lg" className="w-full">
        <Link to={`/evento/${eventSlugOrId}/mapa`}>
          Ver mapa de poltronas <ArrowRight className="ml-2 h-4 w-4" />
        </Link>
      </Button>
    </motion.section>
  );
}
