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
import { RESUMO_REEMBOLSO } from '@/lib/documentos-legais';

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
    a: 'Basta apresentar o QR Code do ingresso (no celular ou impresso) na entrada do evento. A equipe do produtor faz a leitura e libera sua entrada. Nos eventos com entrada pela facial, quem cadastrou a facial entra por ela.',
  },
  {
    q: 'O que é a taxa de serviço que aparece na compra?',
    a: (
      <>
        É o que a FestPag cobra para colocar e manter o evento à venda: publicação, venda pela internet, processamento do pagamento, envio do ingresso, suporte e controle de acesso. Ela é paga por quem compra e aparece somada e separada antes de você confirmar. Quando o ingresso traz o selo "Sem taxa", nenhuma taxa de serviço é somada a ele. A explicação completa está na página{' '}
        <Link to="/taxa" className="text-primary hover:underline">Entenda a taxa</Link>.
      </>
    ),
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
    a: 'Sim. Em Meus Ingressos, abra o ingresso e use "Transferir": informe o CPF e o WhatsApp de quem vai receber. A pessoa recebe um link que vale por 24 horas, e só quem tem aquele CPF consegue aceitar. Ao aceitar, o QR antigo deixa de valer e um novo é gerado no nome dela. Cada ingresso pode ser transferido uma vez, e só antes de ser usado na entrada.',
  },
  {
    q: 'Como pedir reembolso?',
    a: (
      <>
        Em{' '}
        <Link to="/meus-ingressos" className="text-primary hover:underline">Meus Ingressos</Link>
        , pelo botão "Cancelar e pedir reembolso" da compra. Se preferir, escreva para{' '}
        <a href="mailto:suporte@festpag.digital" className="text-primary hover:underline">suporte@festpag.digital</a>
        . {RESUMO_REEMBOLSO.prazo} {RESUMO_REEMBOLSO.taxa} As regras completas estão na{' '}
        <Link to="/reembolso" className="text-primary hover:underline">Política de Reembolso</Link>.
      </>
    ),
  },
  {
    q: 'Esqueci minha senha. Como recupero?',
    a: 'Na tela de login, clique em "Esqueci minha senha" e siga o passo a passo com o código enviado por e-mail. Se a sua conta ainda não tem e-mail, fale com a FestPag pelo WhatsApp (11) 5304-6659.',
  },
  {
    q: 'Não recebi o e-mail de confirmação.',
    a: (
      <>
        Confira a caixa de spam/promoções. Os ingressos também aparecem em Meus Ingressos dentro da sua conta.
        Persistindo, fale com{' '}
        <a href="mailto:suporte@festpag.digital" className="text-primary hover:underline">suporte@festpag.digital</a>.
      </>
    ),
  },
  {
    q: 'Posso comprar ingresso na hora, no dia do evento?',
    a: 'Sim, enquanto houver lotes disponíveis e a venda online estiver aberta. Alguns eventos também aceitam venda na portaria, conforme decisão do produtor.',
  },
  {
    q: 'Meus dados de pagamento ficam seguros?',
    a: 'Sim. O pagamento é feito por um processador de pagamentos certificado. A FestPag não armazena dados completos do cartão.',
  },
];

const produtoresFaq: FAQ[] = [
  {
    q: 'Como crio meu primeiro evento?',
    a: (
      <>
        Acesse a{' '}
        <Link to="/area-do-produtor" className="text-primary hover:underline">Área do Produtor</Link>
        , faça login e clique em <strong>Criar Evento</strong>. O assistente em 4 etapas guia você por Dados do Evento, Data e Local, Ingressos e Revisão.
      </>
    ),
  },
  {
    q: 'Quando meu evento aparece no site?',
    a: 'Depois que você publica o evento no painel (botão Publicar Evento). Eventos em rascunho não aparecem para o público.',
  },
  {
    q: 'Como configuro os lotes e ingressos?',
    a: 'No painel do evento, aba Ingressos: cadastre nome, preço, quantidade e datas de venda. Você pode criar vários lotes (1º lote, 2º lote, etc.) com quantidade limitada.',
  },
  {
    q: 'Como recebo o dinheiro das vendas?',
    a: 'A taxa de serviço é paga por quem compra, somada ao preço do ingresso, a não ser nos lotes vendidos sem taxa para o comprador. Você recebe o valor de face dos ingressos vendidos, menos os descontos de cupom e os reembolsos. Para receber, peça o saque em Financeiro, na Área do Produtor. O valor vai para a conta cadastrada para os repasses.',
  },
  {
    q: 'Onde cadastro minha conta bancária para repasse?',
    // Nome da aba vindo da OS-408 (commit c657066): sobe junto ou depois dela.
    a: 'Em Financeiro, dentro da Área do Produtor, na aba "Conta bancária e PIN".',
  },
  {
    q: 'Como funciona o check-in com a equipe?',
    a: 'Cadastre os colaboradores no menu Colaboradores. Cada um recebe um login próprio e entra em festpag.digital/colaborador, pelo navegador do celular, para ler os QR Codes dos ingressos na portaria e conferir as listas de convidados.',
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
    q: 'O que é o PIN financeiro?',
    a: 'Uma camada extra de segurança: o PIN protege a troca da conta que recebe os repasses e do CPF/CNPJ da produtora. Você cria o seu em Financeiro, na aba "Conta bancária e PIN", e ele também é pedido para abrir o Financeiro.',
  },
  {
    q: 'Como edito um evento já publicado?',
    a: 'No painel do evento, clique em Editar. Alterações relevantes (data, local) devem ser comunicadas aos compradores pelo produtor.',
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

      <div className="min-h-screen">
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
                  href="mailto:suporte@festpag.digital"
                  className="text-primary hover:underline"
                >
                  suporte@festpag.digital
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
