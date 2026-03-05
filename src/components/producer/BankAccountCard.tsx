import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Landmark, Pencil, Save, X, Loader2 } from 'lucide-react';

interface BankAccount {
  bank_name: string;
  account_holder_name: string;
  agency: string;
  account_number: string;
  account_type: string;
  pix_key: string;
  pix_key_type: string;
}

const emptyAccount: BankAccount = {
  bank_name: '',
  account_holder_name: '',
  agency: '',
  account_number: '',
  account_type: 'corrente',
  pix_key: '',
  pix_key_type: 'cpf',
};

const pixKeyTypeLabels: Record<string, string> = {
  cpf: 'CPF',
  email: 'E-mail',
  telefone: 'Telefone',
  aleatoria: 'Chave Aleatória',
};

export function BankAccountCard() {
  const { user } = useAuth();
  const [data, setData] = useState<BankAccount>(emptyAccount);
  const [form, setForm] = useState<BankAccount>(emptyAccount);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasData, setHasData] = useState(false);

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      const { data: row } = await supabase
        .from('producer_bank_accounts' as any)
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (row) {
        const account = row as any as BankAccount;
        setData(account);
        setForm(account);
        setHasData(!!account.bank_name);
      }
      setLoading(false);
    };
    fetch();
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    if (!form.account_holder_name || !form.bank_name || !form.agency || !form.account_number) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('producer_bank_accounts' as any)
      .upsert({
        user_id: user.id,
        ...form,
        updated_at: new Date().toISOString(),
      } as any, { onConflict: 'user_id' });

    if (error) {
      toast.error('Erro ao salvar dados bancários');
    } else {
      setData(form);
      setHasData(true);
      setEditing(false);
      toast.success('Dados bancários salvos com sucesso!');
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (hasData && !editing) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Landmark className="h-5 w-5" />
            Dados Bancários
          </CardTitle>
          <Button variant="outline" size="sm" onClick={() => { setForm(data); setEditing(true); }}>
            <Pencil className="h-4 w-4 mr-1" /> Editar
          </Button>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div><span className="text-muted-foreground">Titular:</span> <span className="font-medium">{data.account_holder_name}</span></div>
            <div><span className="text-muted-foreground">Banco:</span> <span className="font-medium">{data.bank_name}</span></div>
            <div><span className="text-muted-foreground">Agência:</span> <span className="font-medium">{data.agency}</span></div>
            <div><span className="text-muted-foreground">Conta:</span> <span className="font-medium">{data.account_number}</span></div>
            <div><span className="text-muted-foreground">Tipo:</span> <span className="font-medium">{data.account_type === 'corrente' ? 'Corrente' : 'Poupança'}</span></div>
          </div>
          {data.pix_key && (
            <div className="pt-2 border-t border-border">
              <span className="text-muted-foreground">Chave PIX ({pixKeyTypeLabels[data.pix_key_type]}):</span>{' '}
              <span className="font-medium">{data.pix_key}</span>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Landmark className="h-5 w-5" />
          Dados Bancários
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Nome do Titular *</Label>
            <Input value={form.account_holder_name} onChange={(e) => setForm({ ...form, account_holder_name: e.target.value })} placeholder="Nome completo" />
          </div>
          <div className="space-y-2">
            <Label>Banco *</Label>
            <Input value={form.bank_name} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} placeholder="Ex: Nubank, Bradesco" />
          </div>
          <div className="space-y-2">
            <Label>Agência *</Label>
            <Input value={form.agency} onChange={(e) => setForm({ ...form, agency: e.target.value })} placeholder="0001" />
          </div>
          <div className="space-y-2">
            <Label>Conta *</Label>
            <Input value={form.account_number} onChange={(e) => setForm({ ...form, account_number: e.target.value })} placeholder="12345-6" />
          </div>
          <div className="space-y-2">
            <Label>Tipo de Conta</Label>
            <Select value={form.account_type} onValueChange={(v) => setForm({ ...form, account_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="corrente">Corrente</SelectItem>
                <SelectItem value="poupanca">Poupança</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Tipo de Chave PIX</Label>
            <Select value={form.pix_key_type} onValueChange={(v) => setForm({ ...form, pix_key_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cpf">CPF</SelectItem>
                <SelectItem value="email">E-mail</SelectItem>
                <SelectItem value="telefone">Telefone</SelectItem>
                <SelectItem value="aleatoria">Chave Aleatória</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Chave PIX</Label>
            <Input value={form.pix_key} onChange={(e) => setForm({ ...form, pix_key: e.target.value })} placeholder="Sua chave PIX" />
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
            Salvar
          </Button>
          {hasData && (
            <Button variant="outline" onClick={() => { setForm(data); setEditing(false); }}>
              <X className="h-4 w-4 mr-1" /> Cancelar
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
