-- Categorias de evento: o campo passa a valer alguma coisa.
--
-- Por que: o Gabriel pediu a barra de categorias na home (23/09/2026, referência
-- Sympla/Ingresse). A barra era a parte fácil — o problema é que `events.category`
-- estava CRAVADO em 'Outros' no código do criar-evento, então 26 dos 38 eventos
-- nasceram sem categoria e a barra filtraria o vazio.
--
-- Esta migration faz DUAS coisas e nenhuma delas mexe em venda:
--   1. guarda uma cópia do que está lá hoje (dá para desfazer com um comando);
--   2. classifica os 38 eventos que já existem, um a um, pelo título e pela
--      descrição — leitura feita e conferida em 23/09 (decisão do Gabriel:
--      "pode ler o título e a descrição e você define a categoria").
--
-- Os valores novos são os slugs de src/lib/categorias-de-evento.ts. Evento novo
-- passa a nascer com o que o produtor escolher, ou 'outros' se ele não escolher
-- (também decisão dele: o campo é OPCIONAL).

-- ── 1. rede de segurança ────────────────────────────────────────────────────
create schema if not exists backups;

create table if not exists backups.events_category_20260923 as
select id, title, category, now() as copiado_em from public.events;

comment on table backups.events_category_20260923 is
  'Categoria de cada evento ANTES da classificação de 23/09/2026. Para desfazer: update public.events e set category = b.category from backups.events_category_20260923 b where b.id = e.id;';

-- ── 2. classificação dos eventos existentes ─────────────────────────────────
-- Shows e Música — samba, pagode, lançamento de DVD/audiovisual
update public.events set category = 'shows-e-musica' where id in (
  '977052c4-4dfa-4a90-a2cd-c85062f48741',  -- Carlos Caetano - 37 Anos de História
  '63af7bd4-49ef-4533-aab0-cd128c4da1a5',  -- Miguel Lourenço - Lado da Cama
  '61d0b7dc-e789-4f81-b72f-e2567eee995b',  -- Lançamento Feliz no Simples
  '555f3187-24dd-4365-8df0-56c020240d64',  -- Gravação do DVD do SEU MOÇO
  '51ce2615-e357-4c89-8293-af161abc9664',  -- Samba do Brasileiro
  'f1cdc6f9-7a36-4ff0-99e4-b09a05d34848',  -- Samba do Brasileiro
  'b15638f9-e78b-4717-a57e-6acecfad29f1',  -- Samba do Brasileiro
  '6841a8a1-0099-49f5-91ea-1127b5df4acf',  -- Samba do Brasileiro
  '887a15de-d5d3-4761-a1af-4ac7d7888347',  -- Samba do Brasileiro
  'd6af8d5f-a667-40ef-9e8f-8d858ada3919',  -- Segunda Sem Querer
  '43fd9bde-150a-4c1b-a0c0-237bc98787e9',  -- OPOVO PEDE SAMBA
  '8f5f7e93-f2a7-4527-bd5f-d9fcb7a9c576',  -- O POVO PEDE SAMBA
  '6c47f0b0-fe3a-4bf9-805a-2249f5e8eb4d'   -- O Povo Pede Samba
);

-- Festas
update public.events set category = 'festas' where id in (
  '5ce438e2-175a-45d1-b8b1-c8177239920e',  -- DE VOLTA À PISTA (festa retrô)
  'b4ae4b31-69d3-487f-b067-026e6a203c4b',  -- Sunsetdobw
  '4c32dff7-6a18-470e-a50d-1716e8a085eb',  -- Festa na ST
  '2fd77d9d-cbee-49ff-8c5f-7765cf9fc3ef',  -- MADE IN
  'fbe17325-8693-4707-8625-36b76a226384'   -- MADE IN BRAZIL FESTA
);

-- Festivais e Rodeios
update public.events set category = 'festivais-e-rodeios' where id in (
  '0e5d2447-b7f8-47f4-b533-a0f6f76a28a2',  -- VI Oktoberfest Rio Preto
  '53a35128-4902-46b0-99cf-11c7769c52b7'   -- Novo Horizonte Rodeo 2026
);

-- Gastronomia
update public.events set category = 'gastronomia' where id in (
  '7eccee97-80fe-4063-ad8a-f7bc0113bce3',  -- 3º Feijoada do Matteo
  'a8ceede6-37d8-4be4-8a60-f4539024f747'   -- Feijuca da Ana
);

-- Esportes — os três jogos da Copa exibidos na Estação Sambar
update public.events set category = 'esportes' where id in (
  'dfb22efe-1d30-468c-87d6-400624066f37',  -- Escócia x Brasil
  '73bfd23a-24c9-4046-bbfb-a2d997fa2b6d',  -- Brasil x Haiti (cancelado)
  '6209242a-cc5d-4eda-b4ab-4f8d17d74745'   -- Brasil x Marrocos
);

-- Beneficente
update public.events set category = 'beneficente' where id in (
  '4d0cfbee-7207-4dd4-b3be-c7bc9151bd1f',  -- 3ª Porcada do Amor (Hospital de Amor)
  'e86df07b-e06f-471e-abf0-a5ec94a11b93'   -- 5ª Confra do Bem
);

-- Todo o resto (teste, demonstração, "Evento", "Evento Apresentação") vira
-- 'outros' — que é exatamente onde esse tipo de evento deve ficar: fora da barra.
update public.events
   set category = 'outros'
 where category not in (
   'shows-e-musica','festas','festivais-e-rodeios','gastronomia','esportes','beneficente'
 ) or category is null;

-- ── 3. o padrão do banco acompanha o código ─────────────────────────────────
-- Antes era 'Outros' (com maiúscula) vindo do front. Agora o próprio banco
-- garante o valor certo quando ninguém manda nada.
alter table public.events alter column category set default 'outros';
