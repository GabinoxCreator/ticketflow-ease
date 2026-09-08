-- 08/09/2026 — Decisão do Gabriel: "todos os eventos que publicar agora vão pela rota do Marcel".
--
-- A virada de 18/08 foi feita evento por evento e o PADRÃO da coluna continuou
-- 'mercadopago'. Resultado: todo evento criado pelo painel do produtor nascia no
-- Mercado Pago (~10%) em vez da SafeToPay/Marcel (0,46%). O primeiro caso real foi
-- o "Miguel Lourenço — Lado da Cama" (13/09), criado em 01/09, com zero vendas.
--
-- 1) Evento novo nasce no Marcel.
alter table public.events alter column payment_provider set default 'marcel';

-- 2) Todo evento que ainda vai acontecer (hoje ou depois) passa para o Marcel.
--    Evento passado fica como está: o dinheiro dele já entrou no Mercado Pago e
--    virar agora só confundiria o fechamento. Idempotente.
update public.events
   set payment_provider = 'marcel'
 where payment_provider is distinct from 'marcel'
   and date >= current_date;

-- Conferência (rodar depois):
-- select status, payment_provider, count(*) from public.events where date >= current_date group by 1,2;
-- select column_default from information_schema.columns where table_name='events' and column_name='payment_provider';
