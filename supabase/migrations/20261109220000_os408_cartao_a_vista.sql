-- OS-408 (09/11/2026) · painel do produtor: "comprador paga R$ X no cartão à vista".
--
-- Ao digitar o preço do ingresso, o painel mostra quanto o comprador paga no PIX e
-- no cartão à vista (decisão do Gabriel em 09/11: "PIX e cartão"). No cartão, além
-- da taxa da FestPag, entra o custo do cartão da tabela em vigor (2,99% na 1x em
-- 09/11). A conta já existe: `opcoes_parcelamento`, a mesma que cobra no cartão.
-- Só que ela lê `credit_rate_versions`, que o navegador não enxerga (RLS sem regra),
-- e a chamada do painel voltava "sem_tabela_de_taxa".
--
-- Esta função só devolve o total da 1 parcela para um valor, lendo como dona. Não
-- grava nada, não muda a conta de ninguém e não abre a tabela: quem vê é só quem
-- tem login (o produtor no painel). O mesmo número aparece para qualquer comprador
-- na página de pagamento do cartão.
--
-- Sem esta função no ar, o painel mostra só o preço do PIX (a tela cai nisso sozinha).
--
-- Volta atrás: drop function public.cartao_a_vista_cents(bigint);

create or replace function public.cartao_a_vista_cents(_base_cents bigint)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select o.total_cents
    from public.opcoes_parcelamento(_base_cents, false, 1::smallint) o
   where o.parcelas = 1
     and _base_cents between 1 and 100000000;
$$;

revoke all on function public.cartao_a_vista_cents(bigint) from public, anon;
grant execute on function public.cartao_a_vista_cents(bigint) to authenticated;

comment on function public.cartao_a_vista_cents(bigint) is
  'OS-408: total do cartão à vista (1 parcela) para um valor em centavos, pela tabela de custo do cartão em vigor. Só leitura; usado pelo painel do produtor.';
