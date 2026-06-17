import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Activity, AlertTriangle, CheckCircle2, ShoppingCart, Webhook, Clock, Package } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useLatestHealthSnapshot, useRecentHealthSnapshots, useHealthAlerts } from "@/hooks/useHealthSnapshots";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { formatInSaoPaulo } from "@/lib/eventTime";

type Severity = "ok" | "warn" | "crit";

const sevColor = (s: Severity) =>
  s === "crit" ? "bg-red-500/20 text-red-400 border-red-500/40" :
  s === "warn" ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/40" :
  "bg-green-500/20 text-green-400 border-green-500/40";

const sevLabel = (s: Severity) => s === "crit" ? "CRÍTICO" : s === "warn" ? "ATENÇÃO" : "OK";

const SeverityBadge = ({ s }: { s: Severity }) => (
  <Badge variant="outline" className={sevColor(s)}>
    {s === "ok" ? <CheckCircle2 className="w-3 h-3 mr-1" /> : <AlertTriangle className="w-3 h-3 mr-1" />}
    {sevLabel(s)}
  </Badge>
);

const Sparkline = ({ values }: { values: number[] }) => {
  if (!values.length) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const w = 120, h = 32;
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1 || 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg width={w} height={h} className="text-orange-400">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
};

const ActionButton = ({ label, description, onConfirm }: { label: string; description: string; onConfirm: () => Promise<void> }) => {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  return (
    <AlertDialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setConfirm(""); }}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm">{label}</Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="admin-theme">
        <AlertDialogHeader>
          <AlertDialogTitle>{label}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <p className="text-sm">Digite <strong>CONFIRMAR</strong> para prosseguir:</p>
          <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="CONFIRMAR" />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={confirm !== "CONFIRMAR" || loading}
            onClick={async (e) => {
              e.preventDefault();
              setLoading(true);
              try { await onConfirm(); setOpen(false); } finally { setLoading(false); }
            }}
          >
            {loading ? "Executando..." : "Executar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default function AdminSaude() {
  const { data: latest } = useLatestHealthSnapshot();
  const { data: recent } = useRecentHealthSnapshots(60);
  const { data: alerts } = useHealthAlerts();
  const [actionsOpen, setActionsOpen] = useState(false);

  const m = latest?.metrics ?? {};
  const orders = m.orders ?? {};
  const webhooks = m.webhooks ?? {};
  const cron = m.cron ?? {};
  const inventory = m.inventory ?? {};

  const sparkPending = (recent ?? []).slice().reverse().map((s) => s.metrics?.orders?.pending_count ?? 0);
  const sparkWhErr = (recent ?? []).slice().reverse().map((s) => s.metrics?.webhooks?.error_last_hour ?? 0);
  const sparkDrift = (recent ?? []).slice().reverse().map((s) => s.metrics?.inventory?.confirmed_drift_count ?? 0);

  const logAudit = async (action: string, metadata: any) => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    await supabase.from("audit_logs").insert({
      action, target_type: "system", actor_id: auth.user.id, metadata,
    });
  };

  // Contract: dry_run is sent via QUERYSTRING (canonical). Backend also
  // accepts JSON body for compatibility, but only `dry_run=false` triggers
  // real execution — anything else is a safe dry-run.
  const invokeFn = async (name: string, query: string) => {
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}${query}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      body: '{}',
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
    return json;
  };

  const runReconcileDryRun = async () => {
    try {
      const data = await invokeFn('reconcile-orphan-orders', '?dry_run=true');
      await logAudit('manual_reconcile_dry_run', { result: data, dry_run: true });
      toast({ title: 'Dry run concluído (sem mutação)', description: JSON.stringify(data).slice(0, 200) });
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    }
  };

  const runForceExpire = async () => {
    try {
      // Admin manual path: backend authoriza por JWT admin (não por X-Cron-Secret)
      const data = await invokeFn('expire-pending-orders', '');
      await logAudit('manual_expire_run', { result: data });
      toast({ title: 'Varredura executada', description: JSON.stringify(data).slice(0, 200) });
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    }
  };

  return (
    <div className="admin-theme bg-background min-h-screen text-foreground">
    <div className="space-y-6 p-4 md:p-6">

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Activity className="w-6 h-6 text-orange-400" />
          <h1 className="text-2xl font-bold">Saúde do Sistema</h1>
        </div>
        {latest && (
          <div className="flex items-center gap-2">
            <SeverityBadge s={latest.overall_severity} />
            <span className="text-xs text-muted-foreground">
              {formatInSaoPaulo(latest.captured_at, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>
        )}
      </div>

      {!latest && (
        <Card><CardContent className="p-6 text-muted-foreground">Aguardando primeiro snapshot...</CardContent></Card>
      )}

      {latest && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2"><ShoppingCart className="w-4 h-4" /> Orders</CardTitle>
              <SeverityBadge s={orders.severity ?? "ok"} />
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <div>Pendentes: <strong>{orders.pending_count}</strong></div>
              <div>Mais antigo: {Math.floor((orders.pending_oldest_age_seconds ?? 0) / 60)} min</div>
              <div>Pagas (1h): {orders.paid_last_hour} | Expiradas: {orders.expired_last_hour}</div>
              <Sparkline values={sparkPending} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2"><Webhook className="w-4 h-4" /> Webhooks</CardTitle>
              <SeverityBadge s={webhooks.severity ?? "ok"} />
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <div>Recebidos (1h): <strong>{webhooks.received_last_hour}</strong></div>
              <div>OK: {webhooks.ok_last_hour} | Erro: {webhooks.error_last_hour} | Dup: {webhooks.duplicate_last_hour}</div>
              <Sparkline values={sparkWhErr} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2"><Clock className="w-4 h-4" /> Cron</CardTitle>
              <SeverityBadge s={cron.severity ?? "ok"} />
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <div>Última execução: {cron.last_run_at ? formatInSaoPaulo(cron.last_run_at, { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : "—"}</div>
              <div>Status: {cron.last_status ?? "—"}</div>
              <div>Runs (1h): {cron.runs_last_hour} | Falhas: {cron.failed_last_hour}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2"><Package className="w-4 h-4" /> Inventário</CardTitle>
              <SeverityBadge s={inventory.severity ?? "ok"} />
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <div>Drift confirmado: <strong>{inventory.confirmed_drift_count}</strong> lotes</div>
              <div>Drift de reserva: {inventory.reservation_drift_count} lotes</div>
              <Sparkline values={sparkDrift} />
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Alertas recentes (24h)</CardTitle></CardHeader>
        <CardContent>
          {!alerts?.length ? (
            <p className="text-sm text-muted-foreground">Nenhum alerta nas últimas 24h.</p>
          ) : (
            <div className="space-y-2">
              {alerts.map((a) => (
                <div key={a.id} className="flex items-center justify-between p-2 rounded border border-border text-sm">
                  <div className="flex items-center gap-2">
                    <SeverityBadge s={a.overall_severity} />
                    <span>{formatInSaoPaulo(a.captured_at, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    pending={a.metrics?.orders?.pending_count} | wh_err={a.metrics?.webhooks?.error_last_hour} | drift={a.metrics?.inventory?.confirmed_drift_count}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Collapsible open={actionsOpen} onOpenChange={setActionsOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer">
              <CardTitle className="text-base">Ações operacionais {actionsOpen ? "▼" : "▶"}</CardTitle>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-3">
              <div className="flex flex-col sm:flex-row gap-2">
                <ActionButton
                  label="Reconciliar órfãos (dry run)"
                  description="Simula reconciliação de orders pendentes. Não aplica alterações. Será registrado em audit log."
                  onConfirm={runReconcileDryRun}
                />
                <ActionButton
                  label="Forçar varredura de expiração"
                  description="Executa expiração de orders pendentes vencidas imediatamente. Será registrado em audit log."
                  onConfirm={runForceExpire}
                />
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>
    </div>
  );
}

