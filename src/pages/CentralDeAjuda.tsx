import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

type FAQ = { q: string; a: React.ReactNode };

const clientesFaq: FAQ[] = [
  {
    q: 'Onde encontro meus ingressos depois da compra?',
    a: (
      <>
        Após o pagamento ser aprovado, seus ingressos ficam disponíveis em{' '}
        <Link to="/meus-ingressos" className="text-primary hover:underline">Meus Ingressos</Link>{' '}
        (acesse pelo menu do topo, com sua conta logada). Você também recebe um e-mail de confirmação com o QR Code.
      </>
    ),
  },
  {
    q: 'Como faço o check-in no evento?',
    a: 'Basta apresentar o QR Code do ingresso (no celular ou impresso) na entrada do evento. A equipe do produtor faz a leitura e libera sua entrada.',
  },
  {
    q: 'Paguei via PIX, em quanto tempo o ingresso fica liberado?',
    a: 'Assim que a confirmação do pagamento chega (geralmente em poucos segundos), o ingresso é gerado automaticamente e aparece em Meus Ingressos.',
  },
  {
    q: 'Paguei no cartão e a compra foi recusada. O que faço?',
    a: 'Verifique limite, dados do cartão e tente novamente. Se persistir, use outro cartão ou pague via PIX. Compras recusadas não geram cobrança.',
  },
  {
    q: 'Posso transferir meu ingresso para outra pessoa?',
    a: 'Hoje a plataforma não oferece transferência nominal. Quem apresentar o QR Code válido na entrada faz o check-in.',
  },
  {
    q: 'Como pedir reembolso?',
    a: (
      <>
        Pelo e-mail{' '}
        <a href="mailto:contato.festpag@gmail.com" className="text-primary hover:underline">contato.festpag@gmail.com</a>
        , respeitando os prazos da{' '}
        <Link to="/reembolso" className="text-primary hover:underline">Política de Reembolso</Link>{' '}
        (até 7 dias após a compra pelo direito de arrependimento, ou até 48h antes do evento).
      </>
    ),
  },
  {
    q: 'Esqueci minha senha. Como recupero?',
    a: 'Na tela de login, clique em "Esqueci minha senha" e siga o passo a passo com o código enviado por e-mail.',
  },
  {
    q: 'Não recebi o e-mail de confirmação.',
    a: (
      <>
        Confira a caixa de spam/promoções. Os ingressos também aparecem em Meus Ingressos dentro da sua conta.
        Persistindo, fale com{' '}
        <a href="mailto:contato.festpag@gmail.com" className="text-primary hover:underline">contato.festpag@gmail.com</a>.
      </>
    ),
  },
  {
    q: 'Posso comprar ingresso na hora, no dia do evento?',
    a: 'Sim, enquanto houver lotes disponíveis e a venda online estiver aberta. Alguns eventos também aceitam venda na portaria, conforme decisão do produtor.',
  },
  {
    q: 'Meus dados de pagamento ficam seguros?',
    a: 'Sim. O processamento é feito por gateway certificado (Mercado Pago). A FestPag não armazena dados completos do cartão.',
  },
];

const produtoresFaq: FAQ[] = [
  {
    q: 'Como crio meu primeiro evento?',
    a: (
      <>
        Acesse a{' '}
        <Link to="/area-do-produtor" className="text-primary hover:underline">Área do Produtor</Link>
        , faça login e clique em <strong>Criar Evento</strong>. O assistente em 4 etapas guia você por dados básicos, ingressos, imagem e publicação.
      </>
    ),
  },
  {
    q: 'Quando meu evento aparece no site?',
    a: 'Depois que você publica o evento no painel (botão Publicar). Eventos em rascunho não aparecem para o público.',
  },
  {
    q: 'Como configuro os lotes e ingressos?',
    a: 'No painel do evento, aba Lotes: cadastre nome, preço, quantidade e datas de venda. Você pode criar vários lotes (1º lote, 2º lote, etc.) com quantidade limitada.',
  },
  {
    q: 'Como recebo o dinheiro das vendas?',
    a: 'Após o evento, descontada a taxa da plataforma (10%), o valor é transferido para a conta bancária cadastrada nas suas configurações.',
  },
  {
    q: 'Onde cadastro minha conta bancária para repasse?',
    a: 'Em Configurações dentro da Área do Produtor, na seção de dados bancários.',
  },
  {
    q: 'Como funciona o check-in com a equipe?',
    a: 'Cadastre colaboradores em Equipe. Eles recebem login próprio e usam o app para escanear QR Codes na portaria, buscar por nome/CPF e validar listas de convidados.',
  },
  {
    q: 'Posso criar cupons de desconto?',
    a: 'Sim, na aba Cupons do painel do evento. Defina código, percentual ou valor fixo, validade e limite de usos.',
  },
  {
    q: 'Posso criar lista de convidados / cortesias?',
    a: 'Sim, na aba Listas. Você gera um link público para inscrição ou cadastra convidados manualmente. A validação na portaria é feita pela equipe.',
  },
  {
    q: 'Como acompanho as vendas em tempo real?',
    a: 'No painel do evento, abas Visão Geral e Pedidos mostram vendas, faturamento, ingressos vendidos e status de pagamento.',
  },
  {
    q: 'Como registro vendas feitas na portaria (dinheiro/maquininha)?',
    a: 'Use a aba Vendas na Portaria dentro do painel do evento — o estoque do lote é atualizado automaticamente.',
  },
  {
    q: 'O que é o PIN financeiro?',
    a: 'Uma camada extra de segurança para acessar a aba financeira. Configure em Configurações; ele é solicitado sempre que abrir os dados financeiros.',
  },
  {
    q: 'Como edito um evento já publicado?',
    a: 'No painel, clique em Editar Evento. Alterações relevantes (data, local) devem ser comunicadas aos compradores pelo produtor.',
  },
];

function FAQList({ items, idPrefix }: { items: FAQ[]; idPrefix: string }) {
  return (
    <Accordion type="single" collapsible className="space-y-3">
      {items.map((item, i) => (
        <AccordionItem
          key={`${idPrefix}-${i}`}
          value={`${idPrefix}-${i}`}
          className="bg-card border border-border rounded-lg px-4 [&]:border-b"
        >
          <AccordionTrigger className="text-left hover:no-underline font-medium text-foreground">
            {item.q}
          </AccordionTrigger>
          <AccordionContent className="text-muted-foreground leading-relaxed">
            {item.a}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}

export default function CentralDeAjuda() {
  return (
    <>
      <Helmet>
        <title>Central de Ajuda | FestPag</title>
        <meta
          name="description"
          content="Tire suas dúvidas sobre a FestPag: ingressos, check-in, pagamentos, reembolso e funcionalidades para produtores de eventos."
        />
      </Helmet>

      <div className="min-h-screen bg-background">
        <Header />
        <main className="pt-24 pb-16">
          <div className="container mx-auto px-4 max-w-3xl">
            <h1 className="font-display font-bold text-3xl md:text-4xl text-foreground mb-2">
              Central de Ajuda
            </h1>
            <p className="text-muted-foreground text-sm mb-10">
              Respostas rápidas para as dúvidas mais comuns de quem compra ingressos e de quem produz eventos.
            </p>

            <section className="mb-12">
              <h2 className="font-display font-semibold text-xl md:text-2xl text-foreground mb-4">
                Para quem compra ingressos
              </h2>
              <FAQList items={clientesFaq} idPrefix="cliente" />
            </section>

            <section className="mb-12">
              <h2 className="font-display font-semibold text-xl md:text-2xl text-foreground mb-4">
                Para produtores de eventos
              </h2>
              <FAQList items={produtoresFaq} idPrefix="produtor" />
            </section>

            <div className="bg-card border border-border rounded-lg p-6 text-center">
              <p className="text-foreground font-medium mb-1">Não encontrou sua dúvida?</p>
              <p className="text-muted-foreground text-sm">
                Fale com a gente em{' '}
                <a
                  href="mailto:contato.festpag@gmail.com"
                  className="text-primary hover:underline"
                >
                  contato.festpag@gmail.com
                </a>
                .
              </p>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    </>
  );
}
