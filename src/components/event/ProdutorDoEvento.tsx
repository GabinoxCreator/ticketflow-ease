import { motion } from 'framer-motion';
import { Mail, MessageCircle } from 'lucide-react';
import { useProdutorDoEvento } from '@/hooks/useProdutorDoEvento';

// Quem produz o evento e como falar com ele, igual às outras ticketeiras.
// Substituiu o bloco "Políticas do Evento" (14/10/2026, pedido do Gabriel):
// a lista de políticas induzia o comprador a questionar; o contato do produtor
// resolve a dúvida com quem pode responder.

function iniciais(nome: string): string {
  const partes = nome.replace(/[^\p{L}\p{N} ]/gu, ' ').split(' ').filter(Boolean);
  return ((partes[0]?.[0] ?? '') + (partes[1]?.[0] ?? '')).toUpperCase() || '?';
}

function linkDoWhatsApp(phone: string | null, eventTitle: string): string | null {
  let digits = String(phone ?? '').replace(/\D/g, '');
  if (digits.length < 10) return null;
  if (!digits.startsWith('55')) digits = '55' + digits;
  const msg = `Olá! Vi o evento ${eventTitle} na FestPag e tenho uma dúvida.`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(msg)}`;
}

export const ProdutorDoEvento = ({ eventId, eventTitle }: { eventId: string; eventTitle: string }) => {
  const { data: produtor } = useProdutorDoEvento(eventId);
  if (!produtor) return null;

  // Samba do Nobre: mostra o nome da produtora, mas esconde os botões de
  // WhatsApp e e-mail (pedido do Gabriel em 26/10/2026).
  const ocultaContatos = eventId === '9531ba56-5689-4a40-b880-11cb38a04c47';

  const whatsapp = ocultaContatos ? null : linkDoWhatsApp(produtor.phone, eventTitle);
  const email = ocultaContatos ? null : produtor.email?.trim() || null;
  const temContato = !!whatsapp || !!email;


  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="py-2"
    >
      <h3 className="font-display font-bold text-xl mb-4">Produzido por</h3>
      <div className="p-4 rounded-2xl border border-border bg-card space-y-4">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-full overflow-hidden bg-muted flex items-center justify-center shrink-0">
            {produtor.logo_url ? (
              <img src={produtor.logo_url} alt={produtor.brand_name} className="h-full w-full object-cover" />
            ) : (
              <span className="font-display font-bold text-lg text-muted-foreground">{iniciais(produtor.brand_name)}</span>
            )}
          </div>
          <div className="min-w-0">
            <p className="font-semibold truncate">{produtor.brand_name}</p>
            <p className="text-sm text-muted-foreground">
              {temContato ? 'Dúvidas sobre o evento? Fale com a produção.' : 'Produtora do evento'}
            </p>
          </div>
        </div>
        {temContato && (
          <div className="flex flex-col sm:flex-row gap-2">
            {whatsapp && (
              <a
                href={whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 inline-flex items-center justify-center gap-2 h-11 rounded-xl border border-border font-semibold text-sm hover:bg-muted transition-colors"
              >
                <MessageCircle className="h-4 w-4" />
                Falar no WhatsApp
              </a>
            )}
            {email && (
              <a
                href={`mailto:${email}?subject=${encodeURIComponent(eventTitle)}`}
                className="flex-1 inline-flex items-center justify-center gap-2 h-11 rounded-xl border border-border font-semibold text-sm hover:bg-muted transition-colors min-w-0"
              >
                <Mail className="h-4 w-4 shrink-0" />
                <span className="truncate">Enviar e-mail</span>
              </a>
            )}
          </div>
        )}
      </div>
    </motion.section>
  );
};

export default ProdutorDoEvento;
