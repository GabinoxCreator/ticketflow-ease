import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { CreditCard, Loader2, Lock, User, Calendar, Shield, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

/*
 * Formulário de cartão da rota do Marcel — a TELA, sem saber o que está sendo
 * vendido.
 *
 * Existe porque a mesma tela serve ingresso e mesa/camarote, e as duas vendas
 * conversam com edges diferentes (`marcel-process-card` × `marcel-charge-seat-card`),
 * com corpos de requisição diferentes. Duplicar este formulário faria as duas
 * versões divergirem com o tempo — foi exatamente o que aconteceu com as edges
 * de mesa do Mercado Pago, que nasceram cópia uma da outra e hoje tratam o
 * mesmo erro de formas diferentes.
 *
 * Então quem chama diz DUAS coisas: como cotar e como cobrar. O resto — o
 * seletor de parcelas, a composição do preço, os campos do cartão e a trava de
 * duplo clique — é igual para todo mundo e mora aqui.
 */

export interface OpcaoParcelaTela {
  installments: number;
  total: number;
  perInstallment: number;
  /** Custo da operadora nesta faixa. Vem do servidor junto com o total, para a
   *  tela mostrar a linha "taxa de processamento" sem refazer a conta — se ela
   *  recalculasse, poderia divergir do valor efetivamente cobrado. */
  processingFee?: number;
}

export interface CotacaoMarcel {
  options: OpcaoParcelaTela[];
  /** Até quantas parcelas não têm juro para o comprador. 0 = todas têm. */
  parcelasSemJuros?: number;
  /** Valor de face (ingressos ou mesas), antes das taxas. */
  totalFace?: number;
  /** Taxa administrativa do evento. */
  taxaAdministrativa?: number;
}

export interface DadosDoCartao {
  holder: string;
  number: string;
  /** MM/AAAA — formato que a API exige. */
  expiration: string;
  cvv: string;
}

interface Props {
  /** Total a exibir enquanto a cotação não chega. */
  totalAmount: number;
  /** Nome do titular sugerido. */
  nomeSugerido: string;
  /** Como aparece a primeira linha da composição: "Ingressos", "Mesas"... */
  rotuloFace?: string;
  /** Busca as parcelas no servidor. Devolver null mantém o fallback de 1x. */
  cotar: () => Promise<CotacaoMarcel | null>;
  /** Cobra. Lançar erro aqui vira toast; quem chama decide o que fazer depois. */
  cobrar: (args: { installments: number; card: DadosDoCartao }) => Promise<void>;
}

export function CartaoMarcelForm({
  totalAmount, nomeSugerido, rotuloFace = 'Ingressos', cotar, cobrar,
}: Props) {
  const [cardNumber, setCardNumber] = useState('');
  const [cardHolder, setCardHolder] = useState(nomeSugerido);
  const [expiryDate, setExpiryDate] = useState('');
  const [cvv, setCvv] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [options, setOptions] = useState<OpcaoParcelaTela[]>([]);
  const [selectedInstallments, setSelectedInstallments] = useState(1);
  const [loadingQuote, setLoadingQuote] = useState(true);
  // Composição do preço, vinda da cotação. Sem isto o cliente via um valor no
  // resumo e outro para pagar, com a diferença SEM explicação nenhuma — e
  // diferença inexplicada no meio do pagamento faz gente desistir.
  const [composicao, setComposicao] = useState<{ face: number; taxaAdm: number } | null>(null);
  // Até onde o produtor absorve o custo. Vem do servidor: a tela não decide
  // isso, só mostra — refazer a conta aqui abriria divergência com o cobrado.
  const [semJuros, setSemJuros] = useState(0);
  // A cotação falhou. Precisa aparecer na tela: sem isto o seletor de parcelas
  // simplesmente sumia, o cliente achava que o evento não parcela, e o total
  // mostrado era o de antes do custo do cartão — menor do que ele pagaria.
  const [quoteFalhou, setQuoteFalhou] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const r = await cotar();
        if (!active || !r) return;
        if (Array.isArray(r.options) && r.options.length > 0) {
          setOptions(r.options);
        } else {
          // Respondeu, mas sem nenhuma faixa de parcela: para o comprador é
          // igual a ter falhado.
          setQuoteFalhou(true);
        }
        if (typeof r.totalFace === 'number' && typeof r.taxaAdministrativa === 'number') {
          setComposicao({ face: r.totalFace, taxaAdm: r.taxaAdministrativa });
        }
        if (typeof r.parcelasSemJuros === 'number') setSemJuros(r.parcelasSemJuros);
      } catch (err) {
        // ⚠️ NÃO seguir em silêncio. Isto já custou caro (20/08): a cotação
        // recusava o pedido, o seletor de parcelas sumia sem explicação e o
        // botão exibia o total ANTES do custo do cartão. O cliente pagaria um
        // valor que a tela nunca mostrou — ou levaria uma recusa sem motivo.
        console.error('Quote error (Marcel):', err);
        if (active) setQuoteFalhou(true);
      } finally {
        if (active) setLoadingQuote(false);
      }
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Valor exibido = total da opção escolhida (do servidor); fallback pro total da prop.
  const opcaoEscolhida = options.find(o => o.installments === selectedInstallments);
  const selectedTotal = opcaoEscolhida?.total ?? totalAmount;
  const processingFee = opcaoEscolhida?.processingFee ?? 0;

  const formatPrice = (price: number) =>
    price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const formatCardNumber = (value: string) =>
    value.replace(/\D/g, '').slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 ');

  const formatExpiry = (value: string) => {
    const n = value.replace(/\D/g, '').slice(0, 4);
    return n.length > 2 ? `${n.slice(0, 2)}/${n.slice(2)}` : n;
  };

  const handleSubmit = async () => {
    const cleanCard = cardNumber.replace(/\s/g, '');
    const [expMonth, expYear] = expiryDate.split('/');

    if (cleanCard.length < 13 || !expMonth || !expYear || cvv.length < 3 || !cardHolder.trim()) {
      toast.error('Preencha todos os campos corretamente.');
      return;
    }

    setIsProcessing(true);
    try {
      await cobrar({
        installments: selectedInstallments,
        card: {
          holder: cardHolder.trim(),
          number: cleanCard,
          expiration: `${expMonth}/20${expYear}`,
          cvv,
        },
      });
    } catch (err: any) {
      const msg = err?.message || 'Erro ao processar pagamento';
      toast.error(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.25 }}
      className="space-y-5"
    >
      <div className="text-center space-y-1 py-2">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Valor a pagar</p>
        <p className="font-display font-bold text-4xl gradient-text tabular-nums">{formatPrice(selectedTotal)}</p>
      </div>

      {/* De onde vem cada centavo. É o padrão do mercado e resolve a pergunta
          que o cliente faz sozinho: "por que aqui é mais caro que no resumo?" */}
      {composicao && (
        <div className="rounded-lg border border-border/60 bg-muted/20 px-3.5 py-3 space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">{rotuloFace}</span>
            <span className="tabular-nums">{formatPrice(composicao.face)}</span>
          </div>
          {composicao.taxaAdm > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Taxa de serviço</span>
              <span className="tabular-nums">{formatPrice(composicao.taxaAdm)}</span>
            </div>
          )}
          {processingFee > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Taxa de processamento</span>
              <span className="tabular-nums">{formatPrice(processingFee)}</span>
            </div>
          )}
          <div className="flex justify-between pt-1.5 border-t border-border/60 font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{formatPrice(selectedTotal)}</span>
          </div>
        </div>
      )}

      {/* Seletor de parcelas — valores vêm do servidor (cotação). Fallback: só 1x. */}
      {loadingQuote ? (
        <div className="flex justify-center py-1">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      ) : quoteFalhou ? (
        /* Falar a verdade em vez de sumir com o parcelamento. Sem isto o
           comprador conclui que o evento não parcela — e paga um valor que a
           tela não conferiu com o servidor. */
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3.5 py-3 flex gap-2.5">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs leading-relaxed">
            <p className="font-semibold text-amber-300">Não consegui calcular as parcelas agora.</p>
            <p className="text-muted-foreground mt-0.5">
              Recarregue a página e tente de novo. Se continuar, fale com quem te enviou o link —
              não conclua o pagamento sem ver o valor das parcelas.
            </p>
          </div>
        </div>
      ) : options.length > 0 ? (
        <div>
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            Parcelas
          </Label>
          <Select
            value={String(selectedInstallments)}
            onValueChange={(v) => setSelectedInstallments(Number(v))}
          >
            <SelectTrigger className="mt-1.5 h-12 bg-background/60 border-border/60">
              <SelectValue placeholder="Selecione as parcelas" />
            </SelectTrigger>
            <SelectContent>
              {options.map((opt) => (
                <SelectItem key={opt.installments} value={String(opt.installments)}>
                  {opt.installments} {opt.installments === 1 ? 'parcela' : 'parcelas'} de {formatPrice(opt.perInstallment)}
                  {/* "sem juros" é a informação que decide a compra — sem ela, o
                      comprador vê só dois totais diferentes e não entende por
                      que o de 4x é maior. */}
                  {semJuros > 0 && opt.installments <= semJuros
                    ? <span className="text-green-500 font-semibold"> · sem juros</span>
                    : <span className="text-muted-foreground"> ({formatPrice(opt.total)})</span>}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="m-cardNumber">Número do cartão</Label>
        <div className="relative">
          <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input id="m-cardNumber" inputMode="numeric" placeholder="0000 0000 0000 0000" className="pl-10"
            value={cardNumber} onChange={(e) => setCardNumber(formatCardNumber(e.target.value))} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="m-cardHolder">Nome no cartão</Label>
        <div className="relative">
          <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input id="m-cardHolder" placeholder="Como está no cartão" className="pl-10"
            value={cardHolder} onChange={(e) => setCardHolder(e.target.value.toUpperCase())} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="m-expiry">Validade</Label>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input id="m-expiry" inputMode="numeric" placeholder="MM/AA" className="pl-10"
              value={expiryDate} onChange={(e) => setExpiryDate(formatExpiry(e.target.value))} />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="m-cvv">CVV</Label>
          <div className="relative">
            <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input id="m-cvv" inputMode="numeric" placeholder="000" className="pl-10" maxLength={4}
              value={cvv} onChange={(e) => setCvv(e.target.value.replace(/\D/g, '').slice(0, 4))} />
          </div>
        </div>
      </div>

      <Button variant="hero" size="lg" className="w-full h-14 text-base font-semibold"
        onClick={handleSubmit} disabled={isProcessing || quoteFalhou}>
        {isProcessing ? (
          <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Processando...</>
        ) : (
          <><Lock className="w-5 h-5 mr-2" /> Pagar {formatPrice(selectedTotal)}</>
        )}
      </Button>

      <p className="text-[11px] text-center text-muted-foreground flex items-center justify-center gap-1">
        <Lock className="w-3 h-3" /> Pagamento processado com segurança
      </p>
    </motion.div>
  );
}
