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
  Boxes, CheckCircle2, Clock, AlertTriangle, Package,
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
  initial_store: number | null;
  initial_stock: number | null;
  final_store: number | null;
  final_stock: number | null;
  observation?: string;
  _savingInit?: boolean;
  _savingFinal?: boolean;
  _expanded?: boolean;
};

const hasVal = (v: any) => v !== null && v !== undefined && v !== '';
const isInitDone = (i: ItemState) => hasVal(i.initial_store) && hasVal(i.initial_stock);
const isFinalDone = (i: ItemState) => hasVal(i.final_store) && hasVal(i.final_stock);
const isComplete = (i: ItemState) => isInitDone(i) && isFinalDone(i);

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
    if (exec?.items) setItems(exec.items.map((i: any) => ({ ...i })));
  }, [exec]);

  const total = items.length;
  const filled = useMemo(() => items.filter(isComplete).length, [items]);
  const pct = total > 0 ? Math.round((filled / total) * 100) : 0;
  const allDone = total > 0 && filled === total;

  if (!exec) return null;

  const status = exec.status || 'pending';
  const allowPostpone = exec.rule?.allow_postpone ?? true;
  const blockCompletion = exec.rule?.block_route_completion ?? false;
  const isMandatory = (!allowPostpone || blockCompletion || exec.is_mandatory) && !allDone && status !== 'justified';

  const updateField = (idx: number, field: keyof ItemState, v: any) => {
    setItems(prev => {
      const u = [...prev];
      u[idx] = { ...u[idx], [field]: v };
      return u;
    });
  };

  const updateQty = (idx: number, field: 'initial_store' | 'initial_stock' | 'final_store' | 'final_stock', q: string) => {
    updateField(idx, field, q === '' ? null : parseFloat(q));
  };

  const toggleExpand = (idx: number) => updateField(idx, '_expanded', !items[idx]._expanded);

  const savePartial = async (idx: number, phase: 'init' | 'final') => {
    const it = items[idx];
    if (phase === 'init' && !isInitDone(it)) { toast.error('Preencha Frente e Estoque iniciais'); return; }
    if (phase === 'final' && !isFinalDone(it)) { toast.error('Preencha Frente e Estoque finais'); return; }
    updateField(idx, phase === 'init' ? '_savingInit' : '_savingFinal', true);
    try {
      await executeSC.mutateAsync({
        route_id: routeId, brand_id: brandId, pdv_id: pdvId, promoter_id: promoterId,
        items: [{
          product_id: it.product_id,
          initial_store: it.initial_store,
          initial_stock: it.initial_stock,
          final_store: it.final_store,
          final_stock: it.final_stock,
          observation: it.observation ?? null,
        }],
      });
      if (phase === 'init') {
        toast.success('Início salvo. Volte quando fizer a frente.');
      } else {
        toast.success('Produto concluído ✓');
        updateField(idx, '_expanded', false);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao salvar');
    } finally {
      updateField(idx, phase === 'init' ? '_savingInit' : '_savingFinal', false);
    }
  };

  const setZeros = (idx: number, phase: 'init' | 'final') => {
    if (phase === 'init') {
      updateField(idx, 'initial_store', 0);
      setTimeout(() => updateField(idx, 'initial_stock', 0), 0);
    } else {
      updateField(idx, 'final_store', 0);
      setTimeout(() => updateField(idx, 'final_stock', 0), 0);
    }
  };

  const handlePostpone = async () => {
    if (!reason.trim()) { toast.error('Informe o motivo'); return; }
    try {
      const isLast = !allowPostpone || blockCompletion;
      if (isLast || exec.rule?.require_justification) {
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

  // Banner variants
  const bannerClass = allDone
    ? 'border-green-500/60 bg-green-500/10'
    : isMandatory
      ? 'border-destructive/70 bg-destructive/10'
      : 'border-amber-500/60 bg-amber-500/10';
  const iconClass = allDone ? 'text-green-600' : isMandatory ? 'text-destructive' : 'text-amber-600';

  return (
    <>
      {/* Notification banner (top of route) */}
      <div className={`rounded-lg border ${bannerClass} p-3`}>
        <div className="flex items-center gap-3">
          <div className={`h-9 w-9 rounded-full bg-background/60 flex items-center justify-center ${iconClass}`}>
            {allDone ? <CheckCircle2 className="h-5 w-5" /> : <Boxes className="h-5 w-5" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-sm">Contagem de Estoque — {brandName}</p>
              {isMandatory && !allDone && (
                <Badge variant="destructive" className="h-5 text-[10px]">
                  <AlertTriangle className="h-3 w-3 mr-1" />Obrigatória
                </Badge>
              )}
              {allDone && (
                <Badge className="h-5 text-[10px] bg-green-600 hover:bg-green-600">
                  <CheckCircle2 className="h-3 w-3 mr-1" />Concluída
                </Badge>
              )}
            </div>
            {total > 0 && (
              <div className="mt-1.5">
                <div className="flex justify-between text-[11px] text-muted-foreground mb-1">
                  <span>{filled}/{total} produtos</span>
                  <span>{pct}%</span>
                </div>
                <Progress value={pct} className="h-1.5" />
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-2 mt-3">
          <Button size="sm" onClick={() => setSheetOpen(true)} className="flex-1">
            {allDone ? 'Revisar contagem' : 'Contar agora'}
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
          {!allDone && status !== 'justified' && allowPostpone && !blockCompletion && (
            <Button size="sm" variant="outline" onClick={() => setPostponeOpen(true)}>
              <CalendarClock className="h-4 w-4 mr-1" />Adiar
            </Button>
          )}
        </div>
      </div>

      {/* Product-by-product sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto p-0">
          <SheetHeader className="p-4 border-b sticky top-0 bg-background z-10">
            <SheetTitle className="flex items-center gap-2 text-base">
              <Boxes className="h-5 w-5 text-primary" />
              Contagem — {brandName}
            </SheetTitle>
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
              const initReady = isInitDone(item);
              const finReady = isFinalDone(item);
              return (
                <div
                  key={item.product_id || idx}
                  className={`rounded-lg border ${complete ? 'border-green-500/50 bg-green-500/5' : 'bg-card'}`}
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
                            <CheckCircle2 className="h-3 w-3 mr-0.5" />Concluído: {(Number(item.final_store) || 0) + (Number(item.final_stock) || 0)}
                          </Badge>
                        ) : initReady ? (
                          <Badge variant="secondary" className="h-5 text-[10px]">
                            <Clock className="h-3 w-3 mr-0.5" />Início salvo — falta fim
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
                    <div className="border-t p-3 space-y-4">
                      {/* Início */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <Label className="text-xs font-semibold">Início da visita</Label>
                          <div className="flex gap-2">
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setZeros(idx, 'init')}>
                              Zerar
                            </Button>
                            <Button
                              size="sm" className="h-7 text-xs"
                              disabled={item._savingInit || !initReady}
                              onClick={() => savePartial(idx, 'init')}
                            >
                              <Save className="h-3 w-3 mr-1" />
                              {item._savingInit ? 'Salvando...' : 'Salvar início'}
                            </Button>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-[10px] text-muted-foreground">Frente inicial</Label>
                            <Input type="number" min="0" inputMode="numeric" placeholder="0"
                              value={item.initial_store ?? ''}
                              onChange={e => updateQty(idx, 'initial_store', e.target.value)}
                              className="h-9" />
                          </div>
                          <div>
                            <Label className="text-[10px] text-muted-foreground">Estoque inicial</Label>
                            <Input type="number" min="0" inputMode="numeric" placeholder="0"
                              value={item.initial_stock ?? ''}
                              onChange={e => updateQty(idx, 'initial_stock', e.target.value)}
                              className="h-9" />
                          </div>
                        </div>
                      </div>

                      {/* Fim */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <Label className="text-xs font-semibold">Fim da visita</Label>
                          <div className="flex gap-2">
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setZeros(idx, 'final')}>
                              Zerar
                            </Button>
                            <Button
                              size="sm" className="h-7 text-xs"
                              disabled={item._savingFinal || !finReady}
                              onClick={() => savePartial(idx, 'final')}
                            >
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              {item._savingFinal ? 'Salvando...' : 'Concluir produto'}
                            </Button>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-[10px] text-muted-foreground">Frente final</Label>
                            <Input type="number" min="0" inputMode="numeric" placeholder="0"
                              value={item.final_store ?? ''}
                              onChange={e => updateQty(idx, 'final_store', e.target.value)}
                              className="h-9" />
                          </div>
                          <div>
                            <Label className="text-[10px] text-muted-foreground">Estoque final</Label>
                            <Input type="number" min="0" inputMode="numeric" placeholder="0"
                              value={item.final_stock ?? ''}
                              onChange={e => updateQty(idx, 'final_stock', e.target.value)}
                              className="h-9" />
                          </div>
                        </div>
                        {finReady && (
                          <p className="text-[11px] text-muted-foreground mt-1">
                            Total final: <span className="font-medium text-foreground">
                              {(Number(item.final_store) || 0) + (Number(item.final_stock) || 0)}
                            </span>
                          </p>
                        )}
                      </div>

                      <div>
                        <Label className="text-[10px] text-muted-foreground">Observação</Label>
                        <Input placeholder="opcional"
                          value={item.observation ?? ''}
                          onChange={e => updateField(idx, 'observation', e.target.value)}
                          className="h-9" />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="p-3 border-t sticky bottom-0 bg-background flex gap-2">
            {!allDone && status !== 'justified' && allowPostpone && !blockCompletion && (
              <Button variant="outline" className="flex-1" onClick={() => { setSheetOpen(false); setPostponeOpen(true); }}>
                <CalendarClock className="h-4 w-4 mr-1" />Adiar
              </Button>
            )}
            <Button className="flex-1" onClick={() => setSheetOpen(false)}>
              {allDone ? 'Fechar (concluído)' : 'Fechar'}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Postpone dialog */}
      <Dialog open={postponeOpen} onOpenChange={setPostponeOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Adiar contagem</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Motivo *</Label>
              <Input value={reason} onChange={e => setReason(e.target.value)} placeholder="Ex.: PDV sem tempo hábil" />
            </div>
            <div>
              <Label className="text-xs">Observação</Label>
              <Textarea value={obs} onChange={e => setObs(e.target.value)} placeholder="Detalhes (opcional)" rows={3} />
            </div>
            <p className="text-xs text-muted-foreground">
              A contagem reaparecerá na próxima visita desta marca dentro da mesma semana. Se não houver outra visita, será registrada como justificada.
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
