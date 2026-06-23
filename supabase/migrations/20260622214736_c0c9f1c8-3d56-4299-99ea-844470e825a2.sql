-- Segurança (privilege escalation / forja de ticket): remove a policy de INSERT
-- pública da tabela tickets.
--
-- A policy "Sistema pode criar ingressos" estava com WITH CHECK (true) e SEM cláusula
-- TO <role>, ou seja, valia para todos os roles (inclusive anon) — qualquer um podia
-- inserir um ticket válido direto, furando o fluxo de pagamento.
--
-- Seguro remover: tickets só é criado pelas edges create-mercadopago-pix,
-- process-card-payment e admin-generate-courtesy-tickets, todas usando SERVICE_ROLE
-- (que bypassa RLS). O front nunca insere em tickets direto. SELECT/UPDATE seguem
-- restritos (dono / produtor do evento / admin) e não são tocados aqui.

drop policy if exists "Sistema pode criar ingressos" on public.tickets;
