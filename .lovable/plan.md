Frente B / Peça 3 — comprovante de repasse. Backend somente (storage + função). Sem UI, sem tocar em produtor/colaborador/site público.

## 1) Bucket de Storage

Criar bucket privado via `supabase--storage_create_bucket`:
- `name`: `payout-proofs`
- `public`: `false`

Nenhuma alteração no bucket existente `event-images`.

## 2) Policies em `storage.objects` (somente admin)

Migration SQL (somente bucket `payout-proofs`):

```sql
CREATE POLICY "admin_select_payout_proofs"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'payout-proofs' AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "admin_insert_payout_proofs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'payout-proofs' AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "admin_update_payout_proofs"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'payout-proofs' AND public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (bucket_id = 'payout-proofs' AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "admin_delete_payout_proofs"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'payout-proofs' AND public.has_role(auth.uid(), 'admin'::app_role));
```

- Sem policies para `anon`. Produtores/colaboradores não passam no `has_role(..., 'admin')`, então não acessam.
- Policies existentes em outros buckets ficam intactas.

## 3) Função `admin_attach_payout_receipt`

```sql
CREATE OR REPLACE FUNCTION public.admin_attach_payout_receipt(p_payout_id uuid, p_path text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_id
  FROM public.payouts
  WHERE id = p_payout_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'payout_not_found');
  END IF;

  UPDATE public.payouts
  SET receipt_url = p_path
  WHERE id = p_payout_id;

  RETURN jsonb_build_object('ok', true, 'id', p_payout_id, 'receipt_url', p_path);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_attach_payout_receipt(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_attach_payout_receipt(uuid, text) TO authenticated;
```

- Não altera `status`, `paid_at`, `net_amount`, nem qualquer cálculo.
- `receipt_url` guarda o **path** dentro do bucket (não URL pública — o bucket é privado; o frontend usa signed URL depois).

## Ordem de execução
1. `storage_create_bucket(payout-proofs, public=false)`
2. Migration única com as 4 policies + função + REVOKE/GRANT.

## Fora de escopo
Nenhuma UI, nenhuma edge function, nenhuma mudança no schema de `payouts` ou outros buckets/funções.