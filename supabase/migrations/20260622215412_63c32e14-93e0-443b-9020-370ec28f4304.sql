-- Segurança (privilege escalation): remove a policy de INSERT self-grant de user_roles.
--
-- A policy "Usuários podem inserir suas próprias roles" tinha WITH CHECK (auth.uid() = user_id),
-- ou seja, checava só o DONO da linha, não a role inserida. Qualquer usuário autenticado podia
-- rodar INSERT INTO user_roles (user_id, role) VALUES (auth.uid(), 'admin') e se auto-promover.
--
-- Seguro remover: ninguém legítimo insere em user_roles via RLS — o signup grava pela função
-- handle_new_user (SECURITY DEFINER, bypassa RLS) e a promoção de admin é feita pela edge
-- admin-invite-collaborator com SERVICE_ROLE (bypassa RLS). O front nunca insere direto.
-- As policies de SELECT (própria role / admin vê todas) não são tocadas.

drop policy if exists "Usuários podem inserir suas próprias roles" on public.user_roles;
