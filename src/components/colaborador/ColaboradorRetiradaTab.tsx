import { useState } from 'react';
import { Package, Search, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface ColaboradorRetiradaTabProps {
  eventId: string;
  collaboratorId: string;
  sessionToken: string;
  onSessionExpired: () => void;
}

interface Resposta {
  found?: boolean;
  error?: string;
  session_expired?: boolean;
  claim_code?: string;
  holder_name?: string | null;
  itens?: Array<{ rotulo: string; quantidade: number }>;
  pending?: boolean;
  success?: boolean;
  cancelled?: boolean;
  already_redeemed?: boolean;
  picked_up_at?: string | null;
  picked_up_by_name?: string | null;
}

// Aba de retirada de produto da loja do evento. A pessoa informa o código de
// retirada (um por pedido); quem atende CONFERE os itens na tela e só então
// confirma a entrega. A retirada não consome ingresso nenhum.
export default function ColaboradorRetiradaTab({
  eventId,
  collaboratorId,
  sessionToken,
  onSessionExpired,
}: ColaboradorRetiradaTabProps) {
  const [codigo, setCodigo] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [resposta, setResposta] = useState<Resposta | null>(null);

  const chamar = async (confirmar: boolean) => {
    const limpo = codigo.trim().toUpperCase();
    if (!limpo) return;
    setCarregando(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/collaborator-redeem-product`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            claim_code: limpo,
            event_id: eventId,
            collaborator_id: collaboratorId,
            session_token: sessionToken,
            confirmar,
          }),
        },
      );
      const data: Resposta = await response.json();
      if (data.session_expired) {
        onSessionExpired();
        return;
      }
      setResposta(data);
      if (data.success) toast.success('Retirada registrada!');
    } catch {
      toast.error('Sem conexão. Tente de novo.');
    } finally {
      setCarregando(false);
    }
  };

  const limpar = () => {
    setCodigo('');
    setResposta(null);
  };

  const hora = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-amber-500/10 flex items-center justify-center flex-shrink-0">
            <Package className="w-6 h-6 text-amber-600" />
          </div>
          <div>
            <p className="font-bold text-slate-900">Retirada de produto</p>
            <p className="text-xs text-slate-500">Peça o código de retirada do comprador</p>
          </div>
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => { e.preventDefault(); chamar(false); }}
        >
          <input
            value={codigo}
            onChange={(e) => { setCodigo(e.target.value.toUpperCase()); setResposta(null); }}
            placeholder="000000"
            inputMode="numeric"
            maxLength={12}
            autoCapitalize="characters"
            autoCorrect="off"
            aria-label="Código de retirada"
            className="flex-1 min-w-0 h-12 rounded-xl border border-slate-300 px-4 font-mono text-lg tracking-[0.2em] text-slate-900 uppercase focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
          <button
            type="submit"
            disabled={carregando || !codigo.trim()}
            className="h-12 px-4 rounded-xl bg-slate-900 text-white font-semibold flex items-center gap-2 disabled:opacity-50"
          >
            {carregando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Buscar
          </button>
        </form>
      </div>

      {resposta && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
          {resposta.found === false || (!resposta.itens && resposta.error) ? (
            <div className="flex items-start gap-3 text-red-700">
              <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />
              <p className="font-semibold">{resposta.error ?? 'Código não encontrado'}</p>
            </div>
          ) : (
            <>
              <div>
                <p className="text-[11px] uppercase tracking-wider font-bold text-slate-500">Comprador</p>
                <p className="text-lg font-extrabold text-slate-900">{resposta.holder_name || 'Sem nome'}</p>
              </div>
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                {(resposta.itens ?? []).map((i) => (
                  <li key={i.rotulo} className="flex items-center justify-between px-3 py-2.5 text-slate-900">
                    <span className="font-semibold">{i.rotulo}</span>
                    <span className="font-extrabold tabular-nums">{i.quantidade}x</span>
                  </li>
                ))}
              </ul>

              {resposta.cancelled && (
                <div className="flex items-start gap-3 rounded-xl bg-red-50 border border-red-200 p-3 text-red-700">
                  <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />
                  <p className="font-semibold">{resposta.error}</p>
                </div>
              )}

              {resposta.already_redeemed && (
                <div className="flex items-start gap-3 rounded-xl bg-amber-50 border border-amber-200 p-3 text-amber-800">
                  <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />
                  <p className="font-semibold">
                    Já retirado{resposta.picked_up_at ? ` em ${hora(resposta.picked_up_at)}` : ''}
                    {resposta.picked_up_by_name ? `, por ${resposta.picked_up_by_name}` : ''}. Não entregar de novo.
                  </p>
                </div>
              )}

              {resposta.success && (
                <div className="flex items-center gap-3 rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-emerald-700">
                  <CheckCircle2 className="w-5 h-5 shrink-0" />
                  <p className="font-semibold">Entrega registrada. Pode entregar os produtos.</p>
                </div>
              )}

              {resposta.pending && (
                <button
                  type="button"
                  onClick={() => chamar(true)}
                  disabled={carregando}
                  className="w-full h-14 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-white text-lg font-extrabold shadow-lg shadow-amber-500/25 active:scale-[0.98] transition-all disabled:opacity-60"
                >
                  {carregando ? 'Registrando...' : 'Confirmar entrega'}
                </button>
              )}

              {!resposta.pending && (
                <button
                  type="button"
                  onClick={limpar}
                  className="w-full h-12 rounded-xl border border-slate-300 text-slate-700 font-semibold"
                >
                  Próxima retirada
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
