Você tem razão: o horário não passou. O bug está na função da lista pública.

A função cria a data do evento em Brasília, mas depois usa `setHours(18:00)` no ambiente do servidor, que roda em UTC. Com isso, **18:00 de Brasília vira 15:00 de Brasília** na validação, e a lista aparece expirada antes da hora.

Plano de correção:

1. **Corrigir a validação no backend**
   - Em `public-guest-list-signup`, trocar a montagem do prazo para usar diretamente:
     - data do evento
     - horário limite da lista
     - fuso `-03:00`
   - Exemplo lógico: `2026-05-24T18:00:00-03:00`.
   - Assim, 18h será realmente 18h no horário de Brasília.

2. **Corrigir a validação visual no formulário**
   - Aplicar a mesma lógica no formulário público para o botão e mensagens da tela.
   - Evitar que o frontend mostre lista expirada por diferença de fuso.

3. **Melhorar a mensagem de erro exibida**
   - Em vez de mostrar “Edge Function returned a non-2xx status code”, exibir a mensagem real da função, como:
     - “O prazo para inscrição expirou”
     - “Esta lista está cheia”
     - “Esta lista está fechada”

4. **Validar com o link atual**
   - Testar novamente a lista `8ut45u7v` para confirmar que às 16h ela ainda aceita cadastro até 18h.