import { useState, useEffect, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import {
  useRouteStockCount, useExecuteStockCount, usePostponeStockCount, useJustifyStockCount,
} from '@/hooks/use-stock-count';
import { LocalImage } from '@/components/promotor/LocalImage';
import {
  Boxes, CheckCircle2, AlertTriangle, Package,
  CalendarClock, ChevronRight, Save,
} from 'lucide-react';

interface StockCountCardProps {
  routeId: string;
  brandId: string;
  brandName: string;
  pdvId: string;
  promoterId: string;
}

type ItemState = {
  product_id: string;
  product_name?: string;
  sku?: string;
  photo_url?: string;
  store_qty: number | null;
  stock_qty: number | null;
  observation?: string;
  _saving?: boolean;
  _expanded?: boolean;
};

const hasVal = (v: any) => v !== null && v !== undefined && v !== '';
const isComplete = (i: ItemState) => hasVal(i.store_qty) && hasVal(i.stock_qty);
const isPartial = (i: ItemState) => !isComplete(i) && (hasVal(i.store_qty) || hasVal(i.stock_qty));
const hasAnyValue = (i: ItemState) => hasVal(i.store_qty) || hasVal(i.stock_qty);
const totalOf = (i: ItemState) => (Number(i.store_qty) || 0) + (Number(i.stock_qty) || 0);

export function StockCountCard({ routeId, brandId, brandName, pdvId, promoterId }: StockCountCardProps) {
  const { data: execs = [] } = useRouteStockCount(routeId);
  const executeSC = useExecuteStockCount();
  const postpone = usePostponeStockCount();
  const justify = useJustifyStockCount();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [postponeOpen, setPostponeOpen] = useState(false);
  const [items, setItems] = useState<ItemState[]>([]);
  const [reason, setReason] = useState('');
  const [obs, setObs] = useState('');

  const exec: any = (execs as any[]).find((e: any) => e.brand_id === brandId);

  useEffect(() => {
    if (exec?.items) {
      setItems(exec.items.map((i: any) => ({
        product_id: i.product_id,
        product_name: i.product_name,
        sku: i.sku,
        photo_url: i.photo_url,
        store_qty: i.store_qty ?? null,
        stock_qty: i.stock_qty ?? null,
        observation: i.observation ?? '',
      })));
    }
  }, [exec]);

  const total = items.length;
  const filled = useMemo(() => items.filter(isComplete).length, [items]);
  const pct = total > 0 ? Math.round((filled / total) * 100) : 0;
  const allDone = total > 0 && filled === total;

  if (!exec) return null;

  const status = exec.status || 'pending';
  const allowPostpone = exec.rule?.allow_postpone ?? true;
  const blockCompletion = exec.rule?.block_route_completion ?? false;
  const requireJustification = exec.rule?.require_justification ?? false;
  const mustBlock = !allowPostpone || blockCompletion;
  const isMandatory = (mustBlock || exec.is_mandatory) && !allDone && status !== 'justified';
  // Se adiar não é permitido, a contagem é 100% obrigatória — nenhum botão de justificar/adiar.
  const canDefer = !allDone && status !== 'justified' && allowPostpone;

  const updateField = (idx: number, field: keyof ItemState, v: any) => {
    setItems(prev => {
      const u = [...prev];
      u[idx] = { ...u[idx], [field]: v };
      return u;
    });
  };

  const updateQty = (idx: number, field: 'store_qty' | 'stock_qty', q: string) => {
    updateField(idx, field, q === '' ? null : parseFloat(q));
  };

  const toggleExpand = (idx: number) => updateField(idx, '_expanded', !items[idx]._expanded);

  const saveItem = async (idx: number) => {
    const it = items[idx];
    if (!hasAnyValue(it)) { toast.error('Informe Frente ou Estoque'); return; }
    updateField(idx, '_saving', true);
    try {
      const payloadItem: any = { product_id: it.product_id, observation: it.observation ?? null };
      if (hasVal(it.store_qty)) payloadItem.store_qty = it.store_qty;
      if (hasVal(it.stock_qty)) payloadItem.stock_qty = it.stock_qty;
      await executeSC.mutateAsync({
        route_id: routeId, brand_id: brandId, pdv_id: pdvId, promoter_id: promoterId,
        items: [payloadItem],
      });
      if (isComplete(it)) {
        toast.success('Produto contado ✓');
      } else {
        toast.success('Parcial salvo — falta ' + (hasVal(it.store_qty) ? 'Estoque' : 'Frente'));
      }
      updateField(idx, '_expanded', false);
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao salvar');
    } finally {
      updateField(idx, '_saving', false);
    }
  };

  const setZeros = (idx: number) => {
    updateField(idx, 'store_qty', 0);
    setTimeout(() => updateField(idx, 'stock_qty', 0), 0);
  };

  const handlePostpone = async () => {
    if (!allowPostpone) { toast.error('Esta contagem é obrigatória e não pode ser adiada'); return; }
    if (!reason.trim()) { toast.error('Informe o motivo'); return; }
    try {
      if (blockCompletion || requireJustification) {
        await justify.mutateAsync({ execution_id: exec.id, reason, observation: obs });
        toast.success('Justificativa registrada');
      } else {
        const r: any = await postpone.mutateAsync({ execution_id: exec.id, reason, observation: obs });
        toast.success(r?.next_route_id ? 'Adiada para a próxima visita da semana' : 'Adiada — justificativa exigida no fim da semana');
      }
      setPostponeOpen(false);
      setReason(''); setObs('');
    } catch (err: any) {
      toast.error(err?.message || 'Erro');
    }
  };

  const isPostponed = status === 'postponed';
  const isJustified = status === 'justified';
  const isResolved = allDone || isPostponed || isJustified;

  const bannerClass = allDone
    ? 'border-green-500/60 bg-green-500/10'
    : isPostponed
      ? 'border-blue-500/60 bg-blue-500/10'
      : isJustified
        ? 'border-slate-400/60 bg-slate-500/10'
        : isMandatory
          ? 'border-destructive/70 bg-destructive/10'
          : 'border-amber-500/60 bg-amber-500/10';
  const iconClass = allDone
    ? 'text-green-600'
    : isPostponed
      ? 'text-blue-600'
      : isJustified
        ? 'text-slate-600'
        : isMandatory ? 'text-destructive' : 'text-amber-600';

  return (
    <>
      <div className={`rounded-lg border ${bannerClass} p-3`}>
        <div className="flex items-center gap-3">
          <div className={`h-9 w-9 rounded-full bg-background/60 flex items-center justify-center ${iconClass}`}>
            {allDone ? <CheckCircle2 className="h-5 w-5" /> : isPostponed ? <CalendarClock className="h-5 w-5" /> : <Boxes className="h-5 w-5" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-sm">Contagem de Saldo — {brandName}</p>
              {isMandatory && !isResolved && (
                <Badge variant="destructive" className="h-5 text-[10px]">
                  <AlertTriangle className="h-3 w-3 mr-1" />Obrigatória
                </Badge>
              )}
              {allDone && (
                <Badge className="h-5 text-[10px] bg-green-600 hover:bg-green-600">
                  <CheckCircle2 className="h-3 w-3 mr-1" />Concluída
                </Badge>
              )}
              {isPostponed && (
                <Badge className="h-5 text-[10px] bg-blue-600 hover:bg-blue-600">
                  <CalendarClock className="h-3 w-3 mr-1" />Adiada
                </Badge>
              )}
              {isJustified && (
                <Badge className="h-5 text-[10px] bg-slate-500 hover:bg-slate-500">
                  Justificada
                </Badge>
              )}
            </div>
            {total > 0 && !isPostponed && !isJustified && (
              <div className="mt-1.5">
                <div className="flex justify-between text-[11px] text-muted-foreground mb-1">
                  <span>{filled}/{total} produtos</span>
                  <span>{pct}%</span>
                </div>
                <Progress value={pct} className="h-1.5" />
              </div>
            )}
            {isPostponed && (
              <p className="text-[11px] text-muted-foreground mt-1">
                Adiada — a contagem reaparecerá na próxima visita desta semana. Você pode concluir a rota normalmente.
              </p>
            )}
            {isJustified && (
              <p className="text-[11px] text-muted-foreground mt-1">
                Justificada — registrada para o gestor. Você pode concluir a rota.
              </p>
            )}
          </div>
        </div>
        {!isPostponed && !isJustified && (
          <div className="flex gap-2 mt-3">
            <Button size="sm" onClick={() => setSheetOpen(true)} className="flex-1">
              {allDone ? 'Revisar contagem' : 'Contar agora'}
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
            {canDefer && (
              <Button size="sm" variant="outline" onClick={() => setPostponeOpen(true)}>
                <CalendarClock className="h-4 w-4 mr-1" />
                {blockCompletion ? 'Não fiz hoje' : 'Adiar'}
              </Button>
            )}
          </div>
        )}
        {isPostponed && (
          <Button size="sm" variant="outline" onClick={() => setSheetOpen(true)} className="mt-3 w-full">
            Contar mesmo assim
          </Button>
        )}
        {!allDone && !isPostponed && !isJustified && (!allowPostpone || blockCompletion) && (
          <p className="text-[11px] text-muted-foreground mt-2">
            {!allowPostpone
              ? 'Esta contagem é obrigatória e não pode ser adiada — é necessário concluir para finalizar a rota.'
              : 'Esta contagem é obrigatória para concluir a rota. Se não puder fazer, use "Não fiz hoje" e justifique.'}
          </p>
        )}
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto p-0">
          <SheetHeader className="p-4 border-b sticky top-0 bg-background z-10">
            <SheetTitle className="flex items-center gap-2 text-base">
              <Boxes className="h-5 w-5 text-primary" />
              Saldo — {brandName}
            </SheetTitle>
            <p className="text-xs text-muted-foreground">
              Informe o saldo atual: quanto tem na frente/gôndola e quanto tem no estoque. O total é a soma dos dois.
            </p>
            <div className="pt-1">
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>{filled}/{total} produtos concluídos</span>
                <span>{pct}%</span>
              </div>
              <Progress value={pct} className="h-2" />
            </div>
          </SheetHeader>

          <div className="p-3 space-y-2">
            {items.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground text-sm">
                Nenhum produto configurado para contagem
              </p>
            ) : items.map((item, idx) => {
              const complete = isComplete(item);
              const partial = isPartial(item);
              return (
                <div
                  key={item.product_id || idx}
                  className={`rounded-lg border ${complete ? 'border-green-500/50 bg-green-500/5' : partial ? 'border-amber-500/50 bg-amber-500/5' : 'bg-card'}`}
                >
                  <button
                    type="button"
                    onClick={() => toggleExpand(idx)}
                    className="w-full flex items-center gap-3 p-3 text-left"
                  >
                    {item.photo_url ? (
                      <LocalImage src={item.photo_url} alt={item.product_name || ''} className="h-11 w-11 rounded object-cover border shrink-0" />
                    ) : (
                      <div className="h-11 w-11 rounded bg-muted flex items-center justify-center shrink-0">
                        <Package className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm truncate">{item.product_name || `Produto ${idx + 1}`}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {complete ? (
                          <Badge className="h-5 text-[10px] bg-green-600 hover:bg-green-600">
                            <CheckCircle2 className="h-3 w-3 mr-0.5" />Total: {totalOf(item)}
                          </Badge>
                        ) : partial ? (
                          <Badge className="h-5 text-[10px] bg-amber-500 hover:bg-amber-500 text-white">
                            Parcial — falta {hasVal(item.store_qty) ? 'Estoque' : 'Frente'}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="h-5 text-[10px]">Pendente</Badge>
                        )}
                        {item.sku && <span className="text-[10px] text-muted-foreground">SKU: {item.sku}</span>}
                      </div>
                    </div>
                    <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${item._expanded ? 'rotate-90' : ''}`} />
                  </button>

                  {item._expanded && (
                    <div className="border-t p-3 space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold">Saldo atual</Label>
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setZeros(idx)}>
                          Zerar
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-[10px] text-muted-foreground">Frente / gôndola</Label>
                          <Input type="number" min="0" inputMode="numeric" placeholder="0"
                            value={item.store_qty ?? ''}
                            onChange={e => updateQty(idx, 'store_qty', e.target.value)}
                            className="h-9" />
                        </div>
                        <div>
                          <Label className="text-[10px] text-muted-foreground">Estoque</Label>
                          <Input type="number" min="0" inputMode="numeric" placeholder="0"
                            value={item.stock_qty ?? ''}
                            onChange={e => updateQty(idx, 'stock_qty', e.target.value)}
                            className="h-9" />
                        </div>
                      </div>
                      {isComplete(item) && (
                        <p className="text-[11px] text-muted-foreground">
                          Total: <span className="font-medium text-foreground">{totalOf(item)}</span>
                        </p>
                      )}

                      <div>
                        <Label className="text-[10px] text-muted-foreground">Observação</Label>
                        <Input placeholder="opcional"
                          value={item.observation ?? ''}
                          onChange={e => updateField(idx, 'observation', e.target.value)}
                          className="h-9" />
                      </div>

                      <Button
                        size="sm" className="w-full h-9"
                        disabled={item._saving || !hasAnyValue(item)}
                        onClick={() => saveItem(idx)}
                      >
                        <Save className="h-3 w-3 mr-1" />
                        {item._saving
                          ? 'Salvando...'
                          : isComplete(item)
                            ? 'Salvar produto (100%)'
                            : 'Salvar parcial'}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="p-3 border-t sticky bottom-0 bg-background flex gap-2">
            {canDefer && (
              <Button variant="outline" className="flex-1" onClick={() => { setSheetOpen(false); setPostponeOpen(true); }}>
                <CalendarClock className="h-4 w-4 mr-1" />
                {blockCompletion ? 'Não fiz hoje' : 'Adiar'}
              </Button>
            )}
            <Button className="flex-1" onClick={() => setSheetOpen(false)}>
              {allDone ? 'Fechar (concluído)' : 'Fechar'}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={postponeOpen} onOpenChange={setPostponeOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{mustBlock ? 'Justificar não realização' : 'Adiar contagem'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Motivo *</Label>
              <Input value={reason} onChange={e => setReason(e.target.value)} placeholder="Ex.: PDV sem tempo hábil, gerente ausente..." />
            </div>
            <div>
              <Label className="text-xs">Observação</Label>
              <Textarea value={obs} onChange={e => setObs(e.target.value)} placeholder="Detalhes (opcional)" rows={3} />
            </div>
            <p className="text-xs text-muted-foreground">
              {mustBlock
                ? 'Esta contagem é obrigatória. Ao justificar, ela será fechada como “justificada” e a rota poderá ser concluída — mas ficará registrada para o gestor.'
                : 'A contagem reaparecerá na próxima visita desta marca dentro da mesma semana. Se não houver outra visita, será registrada como justificada.'}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPostponeOpen(false)}>Cancelar</Button>
            <Button onClick={handlePostpone}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
