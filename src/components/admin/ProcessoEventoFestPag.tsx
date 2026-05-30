import React, { useMemo, useState } from 'react';
import {
  Handshake,
  ClipboardList,
  Settings,
  MapPin,
  Truck,
  Users,
  PartyPopper,
  Check,
  ChevronDown,
  Zap,
} from 'lucide-react';

type Owner = 'fp' | 'cli' | 'amb';

interface Task {
  title: string;
  sub: string;
  owner: Owner;
  blocker?: boolean;
  dep?: string;
}

type PhaseColor = 'purple' | 'amber' | 'teal' | 'coral' | 'blue' | 'green';

interface Phase {
  id: number;
  color: PhaseColor;
  icon: keyof typeof iconMap;
  title: string;
  meta: string;
  tasks: Task[];
}

const iconMap = {
  Handshake,
  ClipboardList,
  Settings,
  MapPin,
  Truck,
  Users,
  PartyPopper,
  Check,
  ChevronDown,
  Zap,
};

const phaseColors: Record<PhaseColor, { bg: string; fg: string }> = {
  purple: { bg: '#EEEDFE', fg: '#534AB7' },
  amber: { bg: '#FAEEDA', fg: '#854F0B' },
  teal: { bg: '#E1F5EE', fg: '#0F6E56' },
  coral: { bg: '#FAECE7', fg: '#993C1D' },
  blue: { bg: '#E6F1FB', fg: '#185FA5' },
  green: { bg: '#EAF3DE', fg: '#3B6D11' },
};

const ownerStyle: Record<Owner, { bg: string; fg: string; border?: string; label: string }> = {
  fp: { bg: '#E6F1FB', fg: '#185FA5', label: 'FestPag' },
  cli: { bg: '#FAEEDA', fg: '#854F0B', label: 'Cliente' },
  amb: { bg: '#F1EFE8', fg: '#5F5E5A', border: '#D3D1C7', label: 'Ambos' },
};

const phases: Phase[] = [
  {
    id: 1, color: 'purple', icon: 'Handshake',
    title: 'Pós-venda e alinhamento inicial',
    meta: 'Até 48h após fechamento',
    tasks: [
      { title: 'Enviar e coletar assinatura do contrato', sub: 'Taxa sobre faturamento + locação dos equipamentos conforme proposta', owner: 'fp' },
      { title: 'Reunião de kickoff com o cliente', sub: 'Apresentar ecossistema FestPag: Ticketaria, Totens, Smart POS e Gestão. Alinhar escopo, prazos e responsabilidades de cada parte.', owner: 'amb' },
      { title: 'Confirmar datas, local e público estimado', sub: 'Necessário para dimensionar equipamentos e equipe de operação', owner: 'amb' },
      { title: 'Definir data-limite para entrega do mapa de disposição pelo cliente', sub: 'Sem o mapa, não é possível configurar a ticketaria nem abrir a venda de ingressos', owner: 'amb', blocker: true },
    ],
  },
  {
    id: 2, color: 'amber', icon: 'ClipboardList',
    title: 'Entrega de informações pelo cliente',
    meta: 'Até 15 dias antes',
    tasks: [
      { title: 'Cliente envia mapa de disposição do evento', sub: 'Obrigatório: localização de mesas, bistros, áreas VIP, camarotes, bares, portaria e demais setores. Este documento destrava a configuração e a venda de ingressos.', owner: 'cli', blocker: true },
      { title: 'Cliente envia cardápio completo de todos os pontos de venda', sub: 'Itens, preços e categorias por setor (bar, food, VIP etc.) — para configuração nos totens e Smart POS', owner: 'cli', blocker: true },
      { title: 'Cliente define política de ingressos', sub: 'Tipos de acesso (pista, VIP, camarote), lotes, preços e benefícios por setor — alinhado ao mapa entregue', owner: 'cli' },
      { title: 'Cliente informa atrações, horários e programação', sub: 'Apenas para parametrizar sessões na ticketaria. Produção e contratação das atrações são de responsabilidade exclusiva do cliente.', owner: 'cli' },
    ],
  },
  {
    id: 3, color: 'teal', icon: 'Settings',
    title: 'Configuração do sistema',
    meta: 'Após recebimento do mapa — até 10 dias antes',
    tasks: [
      { title: 'Configurar mapa de setores na plataforma', sub: 'Replicar disposição do evento: áreas, setores e pontos de venda conforme mapa do cliente', owner: 'fp', dep: 'Depende: mapa do evento' },
      { title: 'Configurar ticketaria e abrir venda de ingressos', sub: 'Lotes por tipo de acesso (pista, VIP, camarote), QR Code, check-in integrado e validação anti-fraude. Data de abertura definida em conjunto com o cliente.', owner: 'fp', dep: 'Depende: mapa + política de ingressos' },
      { title: 'Configurar cardápio nos totens e Smart POS', sub: 'Itens, preços, fotos e categorias por ponto de venda — cardápio digital personalizado', owner: 'fp', dep: 'Depende: cardápio do cliente' },
      { title: 'Ativar FacePag (se contratado)', sub: 'Pagamento por reconhecimento facial — transação em menos de 5 segundos', owner: 'fp' },
      { title: 'Configurar dashboard e relatórios em tempo real', sub: 'Acesso do cliente via smartphone: vendas, estoque e faturamento por setor', owner: 'fp' },
      { title: 'Validação do cliente nas configurações', sub: 'Cliente revisa e aprova: mapa de setores, cardápio nos totens e tipos de ingresso antes de ir ao ar', owner: 'amb' },
    ],
  },
  {
    id: 4, color: 'coral', icon: 'MapPin',
    title: 'Visita técnica ao local',
    meta: 'Até 5 dias antes',
    tasks: [
      { title: 'Realizar visita técnica presencial', sub: 'Equipe FestPag vai ao local para verificar infraestrutura: energia, internet, layout de fluxo e áreas de maior demanda', owner: 'fp' },
      { title: 'Definir posicionamento final dos equipamentos', sub: 'Confirmar no local onde ficará cada totem, Smart POS fixo e pirulito — com base no mapa do cliente', owner: 'amb' },
      { title: 'Checar conectividade (WiFi e dados móveis)', sub: 'Totens e Smart POS precisam de conexão estável. Levantar plano B caso a internet falhe.', owner: 'fp' },
      { title: 'Cliente providencia infraestrutura necessária', sub: 'Pontos de energia, extensões, réguas e suporte físico para instalação dos totens — responsabilidade do cliente', owner: 'cli' },
    ],
  },
  {
    id: 5, color: 'blue', icon: 'Truck',
    title: 'Preparação, transporte e montagem',
    meta: '1 dia antes do evento',
    tasks: [
      { title: 'Testar todos os equipamentos antes do transporte', sub: 'Totens, Smart POS, impressoras de ficha, cabos e carregadores — nenhum equipamento sai sem teste', owner: 'fp' },
      { title: 'Transportar equipamentos ao local', sub: 'Totens, Smart POS (fixos e pirulitos), acessórios e materiais de suporte', owner: 'fp' },
      { title: 'Montar e posicionar os totens', sub: 'Seguir posicionamento definido na visita técnica e aprovado com o cliente', owner: 'fp' },
      { title: 'Instalar Smart POS em bares, camarotes e caixas fixos', sub: 'Configurar operadores e vincular cada aparelho ao seu ponto de venda no sistema', owner: 'fp' },
      { title: 'Realizar teste completo de ponta a ponta', sub: 'Simular compra no totem, no Smart POS e no FacePag. Testar check-in de ingresso com QR Code.', owner: 'fp' },
    ],
  },
  {
    id: 6, color: 'green', icon: 'Users',
    title: 'Treinamento da equipe operacional',
    meta: 'Dia anterior ou manhã do evento',
    tasks: [
      { title: 'Treinar operadores dos Smart POS', sub: 'Equipe de bares, camarotes e caixas fixos: abertura, venda, sangria e fechamento de turno', owner: 'fp' },
      { title: 'Treinar equipe de portaria no check-in', sub: 'Leitura de QR Code, validação de ingresso por tipo de acesso e controle de entrada — equipe é do cliente, treinamento é da FestPag', owner: 'fp' },
      { title: 'Capacitar supervisor do cliente no dashboard', sub: 'Como acompanhar vendas em tempo real, consultar estoque por setor e acionar suporte', owner: 'fp' },
    ],
  },
  {
    id: 7, color: 'purple', icon: 'PartyPopper',
    title: 'Operação no dia do evento',
    meta: 'No dia',
    tasks: [
      { title: 'Ligar e testar todos os equipamentos antes da abertura', sub: 'Verificar conexão, impressoras, integração com o sistema e leitura de QR Code na portaria', owner: 'fp' },
      { title: 'Suporte técnico local durante todo o evento', sub: 'Equipe FestPag presente para resolver qualquer problema operacional em tempo real', owner: 'fp' },
      { title: 'Monitorar vendas e redistribuir maquininhas se necessário', sub: 'Reforçar Smart POS volante (pirulito) nos pontos com maior fila ou demanda inesperada', owner: 'fp' },
      { title: 'Realizar fechamento financeiro ao final', sub: 'Relatório consolidado: faturamento por setor, ticket médio, total de ingressos validados. Entregue ao cliente no encerramento.', owner: 'fp' },
    ],
  },
];

const LegendDot: React.FC<{ color: string; label: string; border?: string }> = ({ color, label, border }) => (
  <span className="inline-flex items-center gap-1.5 text-[12px]" style={{ color: '#5F5E5A' }}>
    <span
      className="inline-block h-2.5 w-2.5 rounded-full"
      style={{ backgroundColor: color, border: border ? `1px solid ${border}` : undefined }}
    />
    {label}
  </span>
);

const OwnerBadge: React.FC<{ owner: Owner }> = ({ owner }) => {
  const s = ownerStyle[owner];
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ backgroundColor: s.bg, color: s.fg, border: s.border ? `1px solid ${s.border}` : undefined }}
    >
      {s.label}
    </span>
  );
};

const ProcessoEventoFestPag: React.FC = () => {
  const totalTasks = useMemo(() => phases.reduce((acc, p) => acc + p.tasks.length, 0), []);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [openPhases, setOpenPhases] = useState<Record<number, boolean>>(
    () => Object.fromEntries(phases.map((p) => [p.id, true])),
  );

  const toggleTask = (key: string) => {
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const togglePhase = (id: number) => {
    setOpenPhases((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const doneCount = done.size;
  const pct = totalTasks === 0 ? 0 : Math.round((doneCount / totalTasks) * 100);

  return (
    <div className="mx-auto w-full" style={{ maxWidth: 680, color: '#2A2926' }}>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-medium" style={{ color: '#2A2926' }}>
          Mapa de processo de eventos
        </h1>
        <p className="mt-1 text-sm" style={{ color: '#5F5E5A' }}>
          Checklist operacional FestPag por fase — uso interno.
        </p>
      </div>

      {/* Legenda */}
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <LegendDot color="#185FA5" label="FestPag" />
        <LegendDot color="#854F0B" label="Cliente" />
        <LegendDot color="#5F5E5A" label="Ambos" border="#D3D1C7" />
        <LegendDot color="#A32D2D" label="Bloqueador" />
      </div>

      {/* Progresso */}
      <div className="mb-8">
        <div className="h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: '#E8E6DF' }}>
          <div
            className="h-full transition-all"
            style={{ width: `${pct}%`, backgroundColor: '#3B6D11' }}
          />
        </div>
        <p className="mt-2 text-[12px]" style={{ color: '#5F5E5A' }}>
          {doneCount} de {totalTasks} tarefas concluídas · {pct}%
        </p>
      </div>

      {/* Fases */}
      <div className="space-y-3">
        {phases.map((phase) => {
          const PhaseIcon = iconMap[phase.icon];
          const colors = phaseColors[phase.color];
          const isOpen = openPhases[phase.id];
          const phaseDone = phase.tasks.filter((_, i) => done.has(`${phase.id}:${i}`)).length;

          return (
            <div
              key={phase.id}
              className="rounded-lg overflow-hidden"
              style={{ backgroundColor: '#FFFFFF', border: '1px solid #E8E6DF' }}
            >
              <button
                type="button"
                onClick={() => togglePhase(phase.id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[#FAF9F5]"
              >
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                  style={{ backgroundColor: colors.bg, color: colors.fg }}
                >
                  <PhaseIcon size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
                      style={{ backgroundColor: colors.bg, color: colors.fg }}
                    >
                      Fase {phase.id}
                    </span>
                    <h2 className="truncate text-[15px] font-medium" style={{ color: '#2A2926' }}>
                      {phase.title}
                    </h2>
                  </div>
                  <p className="mt-0.5 text-[12px]" style={{ color: '#5F5E5A' }}>
                    {phase.meta}
                  </p>
                </div>
                <span className="text-[12px] tabular-nums" style={{ color: '#5F5E5A' }}>
                  {phaseDone}/{phase.tasks.length}
                </span>
                <ChevronDown
                  size={18}
                  className="shrink-0 transition-transform"
                  style={{
                    color: '#5F5E5A',
                    transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                  }}
                />
              </button>

              {isOpen && (
                <div className="space-y-2 px-4 pb-4">
                  {phase.tasks.map((task, idx) => {
                    const key = `${phase.id}:${idx}`;
                    const isDone = done.has(key);
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => toggleTask(key)}
                        className="flex w-full items-start gap-3 rounded-lg p-3 text-left transition-opacity"
                        style={{
                          backgroundColor: '#F7F6F2',
                          border: '1px solid #E8E6DF',
                          borderRadius: 8,
                          opacity: isDone ? 0.6 : 1,
                        }}
                      >
                        <span
                          className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                          style={{
                            backgroundColor: isDone ? '#EAF3DE' : '#FFFFFF',
                            border: `1.5px solid ${isDone ? '#3B6D11' : '#D3D1C7'}`,
                          }}
                        >
                          {isDone && <Check size={12} style={{ color: '#3B6D11' }} strokeWidth={3} />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p
                            className="text-[14px] font-medium"
                            style={{
                              color: '#2A2926',
                              textDecoration: isDone ? 'line-through' : 'none',
                            }}
                          >
                            {task.title}
                          </p>
                          <p className="mt-1 text-[12.5px] leading-relaxed" style={{ color: '#5F5E5A' }}>
                            {task.sub}
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            <OwnerBadge owner={task.owner} />
                            {task.blocker && (
                              <span
                                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
                                style={{ backgroundColor: '#FCEBEB', color: '#A32D2D' }}
                              >
                                <Zap size={11} />
                                Bloqueador
                              </span>
                            )}
                            {task.dep && (
                              <span
                                className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px]"
                                style={{
                                  backgroundColor: '#F1EFE8',
                                  color: '#5F5E5A',
                                  border: '1px dashed #D3D1C7',
                                }}
                              >
                                {task.dep}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ProcessoEventoFestPag;
