import { motion } from 'framer-motion';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

// Só existe no evento beneficente: o parecer jurídico tem de estar na página de
// compra (item 5 do parecer). As políticas genéricas (meia-entrada, reembolso,
// idade, acesso) saíram da página do evento em 14/10/2026, a pedido do Gabriel:
// induziam o comprador a questionar. No lugar entrou o contato do produtor
// (`ProdutorDoEvento`). A Política de Reembolso continua no rodapé e no aceite.
export const EventPolicies = ({
  beneficentPolicy,
}: {
  /** Parecer do evento beneficente (`getBeneficentPolicy`). */
  beneficentPolicy: { title: string; body: string };
}) => (
  <motion.section
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true }}
    className="py-6"
  >
    <Accordion type="single" collapsible className="rounded-2xl border border-border bg-card overflow-hidden">
      <AccordionItem value="beneficent" className="px-5 border-border/60">
        <AccordionTrigger className="text-left font-semibold hover:no-underline">
          {beneficentPolicy.title}
        </AccordionTrigger>
        <AccordionContent className="text-muted-foreground leading-relaxed whitespace-pre-line">
          {beneficentPolicy.body}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  </motion.section>
);

export default EventPolicies;
