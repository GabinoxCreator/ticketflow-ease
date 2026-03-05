

# Substituir Card do Mercado Pago por Formulário de Dados Bancários

## Problema
A página Financeiro mostra informações sobre Mercado Pago que não são relevantes. O produtor precisa cadastrar seus dados bancários para receber transferências das vendas.

## Solução

### 1. Criar tabela `producer_bank_accounts` no banco de dados

Nova tabela para armazenar dados bancários do produtor:
- `id` (uuid, PK)
- `user_id` (uuid, referência ao auth.users, unique)
- `bank_name` (text) - nome do banco
- `account_holder_name` (text) - nome do titular
- `agency` (text) - agência
- `account_number` (text) - conta
- `account_type` (text) - corrente/poupança
- `pix_key` (text) - chave PIX
- `pix_key_type` (text) - tipo da chave (CPF, email, telefone, aleatória)
- `created_at`, `updated_at`

RLS: produtor só lê/edita seus próprios dados.

### 2. Criar componente `BankAccountCard`

**Arquivo: `src/components/producer/BankAccountCard.tsx`**

Componente com formulário para cadastrar/editar dados bancários:
- Campos: Nome do titular, Banco, Agência, Conta, Tipo de conta (select: Corrente/Poupança), Tipo de chave PIX (select), Chave PIX
- Estado de visualização quando já preenchido (mostra dados com botão "Editar")
- Estado de edição com formulário e botões Salvar/Cancelar
- Validação dos campos obrigatórios

### 3. Atualizar página Financeiro

**Arquivo: `src/pages/Financeiro.tsx`**

- Remover o card do Mercado Pago
- Alterar subtítulo para "Gerencie seus dados bancários para recebimento"
- Adicionar `BankAccountCard` no lugar
- Manter `PinSetupCard` abaixo

## Detalhes Técnicos

### SQL Migration
```sql
CREATE TABLE public.producer_bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  bank_name text NOT NULL DEFAULT '',
  account_holder_name text NOT NULL DEFAULT '',
  agency text NOT NULL DEFAULT '',
  account_number text NOT NULL DEFAULT '',
  account_type text NOT NULL DEFAULT 'corrente',
  pix_key text NOT NULL DEFAULT '',
  pix_key_type text NOT NULL DEFAULT 'cpf',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.producer_bank_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own bank account"
  ON public.producer_bank_accounts FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own bank account"
  ON public.producer_bank_accounts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own bank account"
  ON public.producer_bank_accounts FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);
```

### BankAccountCard
- Busca dados com `supabase.from('producer_bank_accounts').select('*').single()`
- Upsert com `supabase.from('producer_bank_accounts').upsert({...})`
- Exibe formulário ou dados salvos conforme estado

### Financeiro.tsx
- Remove card Mercado Pago, importa `BankAccountCard`
- Subtítulo: "Gerencie seus dados bancários para recebimento"

