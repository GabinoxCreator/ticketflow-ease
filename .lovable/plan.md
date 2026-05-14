# Central de Ajuda — FAQ

Criar a página `/ajuda` no padrão visual de `TermosDeUso` e `PoliticaReembolso`, com um FAQ em formato accordion (caixinhas que abrem/fecham) separado em duas seções: **Para Clientes** e **Para Produtores**. O conteúdo cobre apenas funcionalidades já entregues hoje pela plataforma.

## Arquivos

1. **Novo:** `src/pages/CentralDeAjuda.tsx` — página com Helmet, Header, Footer e dois blocos de Accordion (componente shadcn já disponível em `src/components/ui/accordion.tsx`).
2. **Editar:** `src/App.tsx` — registrar rota `/ajuda` apontando para `CentralDeAjuda`.

O link no Footer já aponta para `/ajuda` — não precisa alterar.

## Estrutura visual

- Container `max-w-3xl` com Header em cima e Footer embaixo.
- Título "Central de Ajuda" + subtítulo curto.
- Campo opcional de busca? **Não** nesta primeira versão — manter simples.
- Duas seções com `<h2>`: "Para quem compra ingressos" e "Para produtores de eventos".
- Em cada seção, um `<Accordion type="single" collapsible>` com perguntas como `AccordionItem`.
- CTA final: "Não encontrou sua dúvida? Fale com a gente em contato.festpag@gmail.com".

## Conteúdo do FAQ

### Para Clientes (compradores)

1. **Onde encontro meus ingressos depois da compra?**
   Após o pagamento ser aprovado, seus ingressos ficam disponíveis em **Meus Ingressos** (acesse pelo menu do topo, com sua conta logada). Você também recebe um e-mail de confirmação com o QR Code.

2. **Como faço o check-in no evento?**
   Basta apresentar o QR Code do ingresso (no app/celular ou impresso) na entrada do evento. A equipe do produtor faz a leitura e libera sua entrada.

3. **Paguei via PIX, em quanto tempo o ingresso fica liberado?**
   Assim que a confirmação do pagamento chega (geralmente em poucos segundos), o ingresso é gerado automaticamente e aparece em Meus Ingressos.

4. **Paguei no cartão e a compra foi recusada. O que faço?**
   Verifique limite, dados do cartão e tente novamente. Se persistir, use outro cartão ou pague via PIX. Compras recusadas não geram cobrança.

5. **Posso transferir meu ingresso para outra pessoa?**
   Hoje a plataforma não oferece transferência nominal. Quem apresentar o QR Code válido na entrada faz o check-in.

6. **Como pedir reembolso?**
   Pelo e-mail **contato.festpag@gmail.com**, respeitando os prazos da [Política de Reembolso](/reembolso) (até 7 dias após a compra pelo direito de arrependimento, ou até 48h antes do evento).

7. **Esqueci minha senha. Como recupero?**
   Na tela de login, clique em "Esqueci minha senha" e siga o passo a passo com o código enviado por e-mail.

8. **Não recebi o e-mail de confirmação.**
   Confira a caixa de spam/promoções. Os ingressos também aparecem em **Meus Ingressos** dentro da sua conta. Persistindo, fale com **contato.festpag@gmail.com**.

9. **Posso comprar ingresso na hora, no dia do evento?**
   Sim, enquanto houver lotes disponíveis e a venda online estiver aberta. Alguns eventos também aceitam venda na portaria, conforme decisão do produtor.

10. **Meus dados de pagamento ficam seguros?**
    Sim. O processamento é feito por gateway certificado (Mercado Pago). A FestPag não armazena dados completos do cartão.

### Para Produtores

1. **Como crio meu primeiro evento?**
   Acesse **Área do Produtor**, faça login e clique em **Criar Evento**. O assistente em 4 etapas guia você por dados básicos, ingressos, imagem e publicação.

2. **Quando meu evento aparece no site?**
   Depois que você publica o evento no painel (botão Publicar). Eventos em rascunho não aparecem para o público.

3. **Como configuro os lotes e ingressos?**
   No painel do evento, aba **Lotes**: cadastre nome, preço, quantidade e datas de venda. Você pode criar vários lotes (1º lote, 2º lote, etc.) com quantidade limitada.

4. **Como recebo o dinheiro das vendas?**
   Os repasses são processados conforme a [política financeira](/produtor/financeiro): após o evento, descontada a taxa da plataforma (10%), o valor é transferido para a conta bancária cadastrada nas suas configurações.

5. **Onde cadastro minha conta bancária para repasse?**
   Em **Configurações** dentro da Área do Produtor, na seção de dados bancários.

6. **Como funciona o check-in com a equipe?**
   Cadastre colaboradores em **Equipe**. Eles recebem login próprio e usam o app para escanear QR Codes na portaria, buscar por nome/CPF e validar listas de convidados.

7. **Posso criar cupons de desconto?**
   Sim, na aba **Cupons** do painel do evento. Defina código, percentual ou valor fixo, validade e limite de usos.

8. **Posso criar lista de convidados / cortesias?**
   Sim, na aba **Listas**. Você gera um link público para inscrição ou cadastra convidados manualmente. A validação na portaria é feita pela equipe.

9. **Como acompanho as vendas em tempo real?**
   No painel do evento, abas **Visão Geral** e **Pedidos** mostram vendas, faturamento, ingressos vendidos e status de pagamento.

10. **Como registro vendas feitas na portaria (dinheiro/maquininha)?**
    Use a aba **Vendas na Portaria** dentro do painel do evento — o estoque do lote é atualizado automaticamente.

11. **O que é o PIN financeiro?**
    Uma camada extra de segurança para acessar a aba financeira. Configure em **Configurações**; ele é solicitado sempre que abrir os dados financeiros.

12. **Como edito um evento já publicado?**
    No painel, clique em **Editar Evento**. Alterações relevantes (data, local) devem ser comunicadas aos compradores pelo produtor.

## Notas técnicas

- Reaproveitar `Accordion`, `AccordionItem`, `AccordionTrigger`, `AccordionContent` de `@/components/ui/accordion`.
- Estilo dark já herdado do tema; envolver cada accordion em `Card` (ou `div` com `bg-card border border-border rounded-lg px-4`) para o efeito "caixinha".
- Helmet: `title="Central de Ajuda | FestPag"`, meta description curta.
- Tipografia idêntica a `TermosDeUso.tsx` (h1, h2, parágrafos com `text-muted-foreground`).
- Links internos (`/reembolso`, `/produtor/financeiro`) usam `<Link>` do react-router.
