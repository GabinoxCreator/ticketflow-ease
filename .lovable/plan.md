## Diagnóstico

- No banco, o evento `Brasil x Marrocos` está correto: `time=17:00:00`, `end_time=01:00:00`, `state=SP`, `status=published`, `event_type=hibrido`.
- Portanto o problema não é dado ausente: é a tela de edição não aplicando os valores carregados nos componentes controlados.
- O screenshot ainda mostra `Horário`, `UF` e validações porque o `reset(formValues)` atual roda só quando `event?.id` muda. Se a query atualiza com o mesmo ID (cache/refetch), o efeito não roda novamente e os Selects ficam com os defaults vazios.
- A imagem preta/sem carregar tem outro motivo confirmado: a URL salva para esse evento aponta para um arquivo inexistente no armazenamento (`Object not found`). A tela precisa limpar visualmente esse preview quebrado e permitir reenviar sem travar.

## Plano de correção

1. **Editar `src/pages/EditarEvento.tsx`**
   - Ajustar a hidratação do formulário para rodar quando os valores reais do evento mudarem, não só quando o ID muda.
   - Usar `reset(formValues, { keepDirtyValues: false })` assim que o evento carregado estiver pronto.
   - Preencher também `imageUrl` no mesmo fluxo de hidratação, garantindo que o editor reflita o evento carregado.
   - Normalizar valores defensivamente:
     - `time` e `end_time`: aceitar `HH:mm:ss` e converter para `HH:mm`.
     - `state`: converter para UF maiúscula.
     - `status`: fallback seguro para `draft` somente se vier ausente.
     - `event_type`: fallback seguro para `ingresso` somente se vier ausente.

2. **Editar `src/components/producer/TimeSelect.tsx`**
   - Tornar o componente tolerante a valores `HH:mm:ss`, normalizando para `HH:mm` antes de passar para o Select.
   - Isso evita placeholder vazio caso algum dado venha direto do banco com segundos.

3. **Editar `src/components/producer/ImageUpload.tsx`**
   - Trocar o comportamento de imagem quebrada para não chamar `onChange(undefined)` automaticamente no render inicial.
   - Em vez disso, mostrar um estado visual de “imagem indisponível” com botão de trocar/remover.
   - Isso evita mutar o estado do formulário só porque a URL antiga está quebrada, mas permite reenviar imagem normalmente.

4. **Validação após implementar**
   - Abrir `/produtor/editar-evento/6209242a-cc5d-4eda-b4ab-4f8d17d74745` em build estável.
   - Confirmar visualmente:
     - Horário de início: `17:00`
     - Horário de fim: `01:00`
     - Estado: `SP`
     - Status: `Publicado`
     - Tipo de venda: `Híbrido`
   - Confirmar que imagem quebrada não fica preta e que o usuário consegue trocar por uma nova.