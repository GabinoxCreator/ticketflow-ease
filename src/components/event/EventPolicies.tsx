import { motion } from 'framer-motion';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Link } from 'react-router-dom';
import { CAMINHOS_LEGAIS, NOMES_LEGAIS, RESUMO_REEMBOLSO } from '@/lib/documentos-legais';

const policies = [
  {
    id: 'meia',
    title: 'Meia-entrada',
    body:
      'Direito à meia-entrada conforme legislação vigente (Lei nº 12.933/2013): estudantes, idosos, PCDs e jovens de baixa renda. Apresentação obrigatória do documento comprobatório na entrada do evento.',
  },
  {
    id: 'cancelamento',
    title: 'Cancelamento e reembolso',
    // O prazo NÃO se escreve aqui: vem do resumo único, que espelha a Política
    // de Reembolso. Este bloco já disse uma regra diferente da Política (01/10/2026).
    body: (
      <>
        {RESUMO_REEMBOLSO.prazo} {RESUMO_REEMBOLSO.taxa} {RESUMO_REEMBOLSO.produtor} As regras completas
        estão na{' '}
        <Link to={CAMINHOS_LEGAIS.reembolso} className="text-primary hover:underline">
          {NOMES_LEGAIS.reembolso}
        </Link>
        .
      </>
    ),
  },
  {
    id: 'idade',
    title: 'Política de idade',
    body:
      'Classificação indicativa conforme indicado pela produção. Menores devem estar acompanhados dos pais ou responsáveis legais, com documentação adequada.',
  },
  {
    id: 'acesso',
    title: 'Acesso ao local',
    body:
      'Apresente o QR Code do seu ingresso (digital ou impresso) na entrada. Recomendamos chegar com antecedência para evitar filas. Itens proibidos podem ser barrados pela segurança.',
  },
];

export const EventPolicies = ({
  beneficentPolicy,
}: {
  /** Parecer do evento beneficente (`getBeneficentPolicy`). Ausente = evento comum. */
  beneficentPolicy?: { title: string; body: string };
}) => {
  const isBeneficent = !!beneficentPolicy;
  // No evento beneficente, meia-entrada não se aplica (são convites) — esconde só esse item.
  const visiblePolicies = policies.filter((p) => !(isBeneficent && p.id === 'meia'));
  // Só no evento beneficente: parecer jurídico como PRIMEIRO item (corpo pré-formatado).
  const items = beneficentPolicy
    ? [
        {
          id: 'beneficent',
          title: beneficentPolicy.title,
          body: beneficentPolicy.body,
          preLine: true,
        },
        ...visiblePolicies.map((p) => ({ ...p, preLine: false })),
      ]
    : visiblePolicies.map((p) => ({ ...p, preLine: false }));
  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="py-6"
    >
      <h3 className="font-display font-bold text-xl mb-4">Políticas do Evento</h3>
      <Accordion type="single" collapsible className="rounded-2xl border border-border bg-card overflow-hidden">
        {items.map((p) => (
          <AccordionItem key={p.id} value={p.id} className="px-5 border-border/60">
            <AccordionTrigger className="text-left font-semibold hover:no-underline">
              {p.title}
            </AccordionTrigger>
            <AccordionContent
              className={`text-muted-foreground leading-relaxed${
                p.preLine ? ' whitespace-pre-line' : ''
              }`}
            >
              {p.body}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </motion.section>
  );
};

export default EventPolicies;
