import { useState, useMemo, useEffect } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useBrands, useProducts, useBrandPdvs } from "@/hooks/use-merchandising";
import {
  useStockCountRules, useUpsertStockCountRule, useDeleteStockCountRule,
} from "@/hooks/use-stock-count";
import { Boxes, Pencil, Trash2, Package, Search } from "lucide-react";
import { toast } from "sonner";

const FREQ_OPTIONS = [
  { value: "weekly", label: "Semanal" },
  { value: "biweekly", label: "Quinzenal" },
  { value: "monthly", label: "Mensal" },
  { value: "bimonthly", label: "Bimestral" },
  { value: "quarterly", label: "Trimestral" },
  { value: "semiannual", label: "Semestral" },
  { value: "annual", label: "Anual" },
  { value: "custom", label: "Personalizado (X dias)" },
];

const WEEKDAYS = [
  { value: 0, label: "Dom" },
  { value: 1, label: "Seg" },
  { value: 2, label: "Ter" },
  { value: 3, label: "Qua" },
  { value: 4, label: "Qui" },
  { value: 5, label: "Sex" },
  { value: 6, label: "Sáb" },
];

const emptyRule = {
  id: null as string | null,
  brand_id: "",
  enabled: true,
  frequency: "weekly",
  frequency_interval: 1,
  custom_days: 30,
  weekdays: [] as number[],
  pdv_overrides: {} as Record<string, { weekdays: number[] }>,
  require_photo: false,
  require_justification: true,
  allow_postpone: true,
  postpone_limit_type: "week",
  block_route_completion: false,
  selected_products: [] as string[],
  notify_on_complete: true,
  notification_emails: "",
};


export default function MerchContagemEstoque() {
  const { data: brands = [] } = useBrands();
  const { data: rules = [], isLoading } = useStockCountRules();
  const upsert = useUpsertStockCountRule();
  const del = useDeleteStockCountRule();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>(emptyRule);
  const [prodSearch, setProdSearch] = useState("");

  const { data: products = [] } = useProducts(
    form.brand_id ? { brand_id: form.brand_id } : undefined,
  );
  const [showAllPdvs, setShowAllPdvs] = useState(false);
  const { data: brandPdvs = [] } = useBrandPdvs(form.brand_id || undefined, { all: showAllPdvs });

  const rulesByBrand = useMemo(() => {
    const map = new Map<string, any>();
    for (const r of rules as any[]) map.set(r.brand_id, r);
    return map;
  }, [rules]);

  const openNew = (brand: any) => {
    const existing = rulesByBrand.get(brand.id);
    setForm(existing
      ? {
          ...emptyRule,
          ...existing,
          selected_products: Array.isArray(existing.selected_products)
            ? existing.selected_products : [],
          frequency_interval: existing.frequency_interval || 1,
          custom_days: existing.custom_days || 30,
          weekdays: Array.isArray(existing.weekdays)
            ? existing.weekdays
            : (existing.weekdays ? JSON.parse(existing.weekdays) : []),
          pdv_overrides: existing.pdv_overrides
            ? (typeof existing.pdv_overrides === 'object' ? existing.pdv_overrides : JSON.parse(existing.pdv_overrides))
            : {},
        }
      : { ...emptyRule, brand_id: brand.id });
    setProdSearch("");
    setOpen(true);
  };

  const handleSave = async () => {
    if (!form.brand_id) { toast.error("Selecione uma marca"); return; }
    try {
      await upsert.mutateAsync({
        ...form,
        selected_products: form.selected_products?.length ? form.selected_products : null,
      });
      toast.success("Regra salva");
      setOpen(false);
    } catch (e: any) { toast.error(e?.message || "Erro ao salvar"); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir esta regra de contagem?")) return;
    try { await del.mutateAsync(id); toast.success("Regra excluída"); }
    catch (e: any) { toast.error(e?.message || "Erro"); }
  };

  const filteredProducts = useMemo(() => {
    const q = prodSearch.toLowerCase();
    return (products as any[]).filter((p: any) =>
      !q || p.name?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q),
    );
  }, [products, prodSearch]);

  const toggleProduct = (id: string) => {
    setForm((f: any) => ({
      ...f,
      selected_products: f.selected_products.includes(id)
        ? f.selected_products.filter((x: string) => x !== id)
        : [...f.selected_products, id],
    }));
  };

  const freqLabel = (r: any) => {
    const base = FREQ_OPTIONS.find(o => o.value === r.frequency)?.label || r.frequency;
    if (r.frequency === "custom") return `A cada ${r.custom_days || 0} dias`;
    if ((r.frequency_interval || 1) > 1) return `${base} (×${r.frequency_interval})`;
    return base;
  };

  const weekdaysLabel = (r: any) => {
    const wd = Array.isArray(r.weekdays) ? r.weekdays : (r.weekdays ? JSON.parse(r.weekdays) : null);
    if (!wd || !wd.length) return null;
    return wd.map((n: number) => WEEKDAYS.find(w => w.value === Number(n))?.label).filter(Boolean).join(", ");
  };

  const toggleWeekday = (n: number) => {
    setForm((f: any) => ({
      ...f,
      weekdays: f.weekdays.includes(n)
        ? f.weekdays.filter((x: number) => x !== n)
        : [...f.weekdays, n].sort((a: number, b: number) => a - b),
    }));
  };

  const togglePdvWeekday = (pdvId: string, n: number) => {
    setForm((f: any) => {
      const ov = { ...(f.pdv_overrides || {}) };
      const cur = ov[pdvId]?.weekdays || [];
      const next = cur.includes(n) ? cur.filter((x: number) => x !== n) : [...cur, n].sort((a: number, b: number) => a - b);
      if (next.length === 0) delete ov[pdvId];
      else ov[pdvId] = { weekdays: next };
      return { ...f, pdv_overrides: ov };
    });
  };

  const clearPdvOverride = (pdvId: string) => {
    setForm((f: any) => {
      const ov = { ...(f.pdv_overrides || {}) };
      delete ov[pdvId];
      return { ...f, pdv_overrides: ov };
    });
  };

  return (
    <MainLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Boxes className="h-6 w-6 text-primary" /> Contagem de Estoque
            </h1>
            <p className="text-sm text-muted-foreground">
              Configure regras de contagem de saldo por marca. Se o promotor não
              fizer hoje, a contagem passa para a próxima visita da mesma janela.
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Regras por Marca</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Carregando...</p>
            ) : brands.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma marca cadastrada.</p>
            ) : (
              <div className="grid gap-3">
                {(brands as any[]).map((b: any) => {
                  const rule = rulesByBrand.get(b.id);
                  return (
                    <div key={b.id} className="flex items-center justify-between border rounded-lg p-3">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <Package className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">{b.name}</p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {rule ? (
                              <>
                                <Badge variant={rule.enabled ? "default" : "secondary"}>
                                  {rule.enabled ? "Ativa" : "Desativada"}
                                </Badge>
                                <Badge variant="outline">{freqLabel(rule)}</Badge>
                                {weekdaysLabel(rule) && (
                                  <Badge variant="outline">{weekdaysLabel(rule)}</Badge>
                                )}
                                {rule.block_route_completion && (
                                  <Badge className="bg-red-100 text-red-800">Bloqueia conclusão</Badge>
                                )}
                                {rule.allow_postpone && (
                                  <Badge variant="outline">Permite adiar</Badge>
                                )}
                                {Array.isArray(rule.selected_products) && rule.selected_products.length > 0 && (
                                  <Badge variant="outline">
                                    {rule.selected_products.length} produtos
                                  </Badge>
                                )}
                              </>
                            ) : (
                              <Badge variant="outline">Sem regra</Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => openNew(b)}>
                          <Pencil className="h-3 w-3 mr-1" /> {rule ? "Editar" : "Configurar"}
                        </Button>
                        {rule && (
                          <Button size="sm" variant="ghost" onClick={() => handleDelete(rule.id)}>
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Regra de Contagem de Estoque</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between border rounded-lg p-3">
              <div>
                <p className="font-medium text-sm">Ativa</p>
                <p className="text-xs text-muted-foreground">
                  Enquanto ativada, a contagem aparece nas rotas desta marca.
                </p>
              </div>
              <Switch
                checked={!!form.enabled}
                onCheckedChange={(v) => setForm({ ...form, enabled: v })}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Frequência</Label>
                <Select
                  value={form.frequency}
                  onValueChange={(v) => setForm({ ...form, frequency: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FREQ_OPTIONS.map(o => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {form.frequency !== "custom" ? (
                <div>
                  <Label className="text-xs">Intervalo (a cada X)</Label>
                  <Input
                    type="number" min={1} value={form.frequency_interval}
                    onChange={e => setForm({ ...form, frequency_interval: parseInt(e.target.value) || 1 })}
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Ex.: Mensal + 2 = a cada 2 meses.
                  </p>
                </div>
              ) : (
                <div>
                  <Label className="text-xs">Dias entre contagens</Label>
                  <Input
                    type="number" min={1} value={form.custom_days}
                    onChange={e => setForm({ ...form, custom_days: parseInt(e.target.value) || 1 })}
                  />
                </div>
              )}
            </div>

            <div className="border rounded-lg p-3">
              <Label className="text-sm">Dias da semana</Label>
              <p className="text-[11px] text-muted-foreground mb-2">
                Selecione em quais dias da semana a contagem deve aparecer. Deixe vazio para todos os dias.
              </p>
              <div className="flex flex-wrap gap-2">
                {WEEKDAYS.map(w => {
                  const active = form.weekdays?.includes(w.value);
                  return (
                    <Button
                      key={w.value}
                      type="button"
                      size="sm"
                      variant={active ? "default" : "outline"}
                      className="h-8 px-3"
                      onClick={() => toggleWeekday(w.value)}
                    >
                      {w.label}
                    </Button>
                  );
                })}
              </div>
            </div>

            <div className="border rounded-lg p-3">
              <div className="flex items-center justify-between gap-2 mb-1">
                <Label className="text-sm">Dias específicos por PDV (opcional)</Label>
                <Button
                  type="button" size="sm" variant="outline" className="h-7 text-[11px]"
                  onClick={() => setShowAllPdvs(v => !v)}
                >
                  {showAllPdvs ? "Somente PDVs vinculados" : "Mostrar todos os PDVs"}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground mb-2">
                Sobrescreve os dias da regra para PDVs específicos. Ex.: PDV A na segunda, PDV B na terça.
                Deixe sem marcar para o PDV seguir os dias gerais acima.
              </p>
              {brandPdvs.length === 0 ? (
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>Nenhum PDV {showAllPdvs ? "encontrado na organização" : "vinculado a esta marca"}.</p>
                  {!showAllPdvs && (
                    <p>Clique em <strong>"Mostrar todos os PDVs"</strong> para configurar mesmo sem vínculo explícito.</p>
                  )}
                </div>
              ) : (
                <ScrollArea className="h-56 pr-2">
                  <div className="space-y-2">
                    {(brandPdvs as any[]).map((p: any) => {
                      const pdvId = p.pdv_id || p.id;
                      const pdvName = p.pdv_name || p.name || pdvId;
                      const ov = form.pdv_overrides?.[pdvId]?.weekdays || [];
                      const hasOv = ov.length > 0;
                      return (
                        <div key={pdvId} className="border rounded p-2">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-xs font-medium">{pdvName}</p>
                            {hasOv && (
                              <Button type="button" size="sm" variant="ghost" className="h-6 text-[10px]"
                                onClick={() => clearPdvOverride(pdvId)}>
                                Limpar
                              </Button>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {WEEKDAYS.map(w => {
                              const active = ov.includes(w.value);
                              return (
                                <Button
                                  key={w.value}
                                  type="button"
                                  size="sm"
                                  variant={active ? "default" : "outline"}
                                  className="h-7 px-2 text-[11px]"
                                  onClick={() => togglePdvWeekday(pdvId, w.value)}
                                >
                                  {w.label}
                                </Button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}
            </div>



            <div className="grid grid-cols-1 gap-2 border rounded-lg p-3">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={!!form.allow_postpone}
                  onCheckedChange={(v) => setForm({ ...form, allow_postpone: !!v })}
                />
                Permitir "Não fiz hoje" (adiar para próxima visita da janela)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={!!form.require_justification}
                  onCheckedChange={(v) => setForm({ ...form, require_justification: !!v })}
                />
                Exigir justificativa se não for feita na janela
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={!!form.block_route_completion}
                  onCheckedChange={(v) => setForm({ ...form, block_route_completion: !!v })}
                />
                Bloquear conclusão da rota até fazer/justificar
              </label>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm">Produtos para contagem</Label>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground">
                    {form.selected_products.length === 0
                      ? "Todos os produtos da marca"
                      : `${form.selected_products.length} selecionados`}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    type="button"
                    className="h-7 text-xs"
                    onClick={() => {
                      const allIds = filteredProducts.map((p: any) => p.id);
                      const allSelected = allIds.length > 0 && allIds.every((id: string) => form.selected_products.includes(id));
                      setForm((f: any) => ({
                        ...f,
                        selected_products: allSelected
                          ? f.selected_products.filter((id: string) => !allIds.includes(id))
                          : Array.from(new Set([...f.selected_products, ...allIds])),
                      }));
                    }}
                  >
                    {filteredProducts.length > 0 && filteredProducts.every((p: any) => form.selected_products.includes(p.id))
                      ? "Desmarcar todos"
                      : "Marcar todos"}
                  </Button>
                </div>
              </div>
              <div className="relative mb-2">
                <Search className="h-3.5 w-3.5 absolute left-2 top-2.5 text-muted-foreground" />
                <Input
                  className="pl-7 h-9"
                  placeholder="Buscar produto..."
                  value={prodSearch}
                  onChange={e => setProdSearch(e.target.value)}
                />
              </div>
              <ScrollArea className="h-60 border rounded-lg p-2">
                {filteredProducts.length === 0 ? (
                  <p className="text-xs text-muted-foreground p-2">
                    {form.brand_id ? "Nenhum produto." : "Selecione uma marca."}
                  </p>
                ) : (
                  <div className="space-y-1">
                    {filteredProducts.map((p: any) => (
                      <label key={p.id} className="flex items-center gap-2 py-1 px-2 rounded hover:bg-muted text-sm">
                        <Checkbox
                          checked={form.selected_products.includes(p.id)}
                          onCheckedChange={() => toggleProduct(p.id)}
                        />
                        <span className="flex-1 truncate">{p.name}</span>
                        {p.sku && <span className="text-xs text-muted-foreground">{p.sku}</span>}
                      </label>
                    ))}
                  </div>
                )}
              </ScrollArea>
              <p className="text-[10px] text-muted-foreground mt-1">
                Deixe vazio para contar todos os produtos da marca.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={upsert.isPending}>
              {upsert.isPending ? "Salvando..." : "Salvar Regra"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
