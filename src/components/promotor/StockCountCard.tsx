import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
  Boxes, ChevronRight, CheckCircle2, Clock, AlertTriangle, Save, Package,
  CalendarClock, XCircle,
} from 'lucide-react';

interface StockCountCardProps {
  routeId: string;
  brandId: string;
  brandName: string;
  pdvId: string;
  promoterId: string;
}

export function StockCountCard({ routeId, brandId, brandName, pdvId, promoterId }: StockCountCardProps) {
  const { data: execs = [] } = useRouteStockCount(routeId);
  const executeSC = useExecuteStockCount();
  const postpone = usePostponeStockCount();
  const justify = useJustifyStockCount();

  const [open, setOpen] = useState(false);
  const [postponeOpen, setPostponeOpen] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [reason, setReason] = useState('');
  const [obs, setObs] = useState('');
  const [saving, setSaving] = useState(false);

  const exec = execs.find((e: any) => e.brand_id === brandId);

  useEffect(() => {
    if (exec?.items) setItems(exec.items);
  }, [exec]);

  if (!exec) return null;

  const status = exec.status || 'pending';
  const allowPostpone = exec.rule?.allow_postpone ?? true;
  const blockCompletion = exec.rule?.block_route_completion ?? false;
  // Se prorrogação não é permitida OU regra bloqueia conclusão → obrigatória nesta visita.
  const isMandatory = (!allowPostpone || blockCompletion || exec.is_mandatory) && status !== 'completed' && status !== 'justified';

  const filled = items.filter(i => i.quantity !== null && i.quantity !== undefined && i.quantity !== '').length;
  const total = items.length;
  const pct = total > 0 ? Math.round((filled / total) * 100) : 0;

  const updateQty = (idx: number, q: string) => {
    const u = [...items];
    u[idx] = { ...u[idx], quantity: q === '' ? null : parseFloat(q) };
    setItems(u);
  };

  const updateObs = (idx: number, o: string) => {
    const u = [...items]; u[idx] = { ...u[idx], observation: o }; setItems(u);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await executeSC.mutateAsync({
        route_id: routeId, brand_id: brandId, pdv_id: pdvId, promoter_id: promoterId,
        items: items.map(i => ({ product_id: i.product_id, quantity: i.quantity, observation: i.observation })),
      });
      toast.success('Contagem salva!');
      setOpen(false);
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao salvar');
    } finally { setSaving(false); }
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

  const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
    pending: { label: 'Não iniciada', color: 'bg-muted text-muted-foreground', icon: Clock },
    in_progress: { label: 'Em andamento', color: 'bg-blue-100 text-blue-800', icon: Clock },
    completed: { label: 'Concluída', color: 'bg-green-100 text-green-800', icon: CheckCircle2 },
    postponed: { label: 'Adiada', color: 'bg-orange-100 text-orange-800', icon: CalendarClock },
    justified: { label: 'Justificada', color: 'bg-gray-200 text-gray-800', icon: XCircle },
    mandatory: { label: 'Obrigatória', color: 'bg-red-100 text-red-800', icon: AlertTriangle },
  };
  const displayStatus = isMandatory && status !== 'completed' && status !== 'justified' ? 'mandatory' : status;
  const sc = statusConfig[displayStatus] || statusConfig.pending;
  const StatusIcon = sc.icon;

  return (
    <>
      <Card
        className={`cursor-pointer hover:shadow-md transition-shadow ${isMandatory ? 'border-destructive' : ''}`}
        onClick={() => setOpen(true)}
      >
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Boxes className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium text-sm">Contagem de Estoque</p>
                <p className="text-xs text-muted-foreground">{brandName}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge className={sc.color}>
                <StatusIcon className="h-3 w-3 mr-1" />{sc.label}
              </Badge>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
          </div>
          {total > 0 && (
            <div className="mt-3">
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>{filled}/{total} produtos</span>
                <span>{pct}%</span>
              </div>
              <Progress value={pct} className="h-2" />
            </div>
          )}
          {isMandatory && (
            <p className="text-xs text-destructive mt-2 font-medium">
              ⚠️ Contagem obrigatória nesta visita
            </p>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Boxes className="h-5 w-5 text-primary" />
              Contagem de Estoque — {brandName}
            </DialogTitle>
          </DialogHeader>

          {items.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">
              Nenhum produto configurado para contagem nesta marca
            </p>
          ) : (
            <div className="space-y-3">
              {items.map((item, idx) => (
                <Card key={item.product_id || idx} className="p-3">
                  <div className="flex items-center gap-3 mb-2">
                    {item.photo_url ? (
                      <LocalImage src={item.photo_url} alt={item.product_name} className="h-12 w-12 rounded object-cover border" />
                    ) : (
                      <div className="h-12 w-12 rounded bg-muted flex items-center justify-center">
                        <Package className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{item.product_name || `Produto ${idx + 1}`}</p>
                      {item.sku && <p className="text-xs text-muted-foreground">SKU: {item.sku}</p>}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Quantidade</Label>
                      <Input
                        type="number" min="0" step="1" inputMode="numeric"
                        placeholder="0"
                        value={item.quantity ?? ''}
                        onChange={e => updateQty(idx, e.target.value)}
                        className="h-9"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Obs</Label>
                      <Input
                        placeholder="opcional"
                        value={item.observation ?? ''}
                        onChange={e => updateObs(idx, e.target.value)}
                        className="h-9"
                      />
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}

          <DialogFooter className="flex flex-col sm:flex-row gap-2">
            {status !== 'completed' && status !== 'justified' && !isMandatory && (
              <Button variant="outline" onClick={() => { setOpen(false); setPostponeOpen(true); }} className="sm:mr-auto">
                <CalendarClock className="h-4 w-4 mr-1" />
                Não fiz hoje
              </Button>
            )}
            <Button variant="outline" onClick={() => setOpen(false)}>Fechar</Button>
            <Button onClick={handleSave} disabled={saving || items.length === 0}>
              <Save className="h-4 w-4 mr-1" />
              {saving ? 'Salvando...' : 'Salvar Contagem'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={postponeOpen} onOpenChange={setPostponeOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Não fiz a contagem hoje</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Motivo *</Label>
              <Input
                value={reason} onChange={e => setReason(e.target.value)}
                placeholder="Ex.: PDV sem tempo hábil"
              />
            </div>
            <div>
              <Label className="text-xs">Observação</Label>
              <Textarea
                value={obs} onChange={e => setObs(e.target.value)}
                placeholder="Detalhes (opcional)" rows={3}
              />
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
