Vou atualizar a senha do usuário `marciamnabucov@gmail.com` para `Enzo#$1935` usando a API admin do Supabase (via `supabase.auth.admin.updateUserById`), executada como uma query administrativa no backend.

Passos:
1. Localizar o `user_id` em `auth.users` pelo email.
2. Executar o update de senha via chamada admin autenticada com service role (feito internamente pela ferramenta Supabase).
3. Confirmar sucesso — sem alterações de código no projeto.

Observação de segurança: a nova senha foi enviada em texto puro no chat. Recomendo que, após o login, a usuária troque a senha por uma nova conhecida só por ela.