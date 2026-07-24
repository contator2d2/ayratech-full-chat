import { useMemo, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMerchRoutes, useRouteAuditLogs, useRouteAuthors, useRouteAssignmentHistory } from "@/hooks/use-merch-routes";
import { useBrands } from "@/hooks/use-merchandising";
import { useEmployees } from "@/hooks/use-rh";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { Shield, Eye, Clock, User, Edit, ArrowLeftRight, AlertTriangle, ChevronDown, X, Search } from "lucide-react";

const FIELD_LABELS: Record<string, string> = {
  promoter_id: 'Promotor', photo_added: 'Foto adicionada', photo_removed: 'Foto removida',
  notes: 'Observações', status: 'Status', checklist_id: 'Checklist', visit_date: 'Data da visita',
  scheduled_time: 'Horário', brand_id: 'Marca', pdv_id: 'PDV',
};

const ACTION_LABELS: Record<string, string> = {
  checkin: 'Check-in', checkout: 'Check-out', photo_upload: 'Foto enviada',
  contingency_photo: 'Foto contingência', stock_count: 'Contagem estoque',
  validity_check: 'Verificação validade', damage_report: 'Registro avaria',
  rupture_report: 'Registro ruptura', execution_update: 'Atualização execução',
};

type Option = { id: string; label: string };

function MultiSelectFilter({
  placeholder, searchPlaceholder, options, selected, onChange, minWidth = 180,
}: {
  placeholder: string;
  searchPlaceholder: string;
  options: Option[];
  selected: string[];
  onChange: (next: string[]) => void;
  minWidth?: number;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return options;
    return options.filter(o => o.label.toLowerCase().includes(s));
  }, [q, options]);

  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]);
  };

  const label = selected.length === 0
    ? placeholder
    : selected.length === 1
      ? (options.find(o => o.id === selected[0])?.label || '1 selecionado')
      : `${selected.length} selecionados`;

  return (
    <div className="flex-1" style={{ minWidth }}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="w-full justify-between font-normal">
            <span className="truncate">{label}</span>
            <ChevronDown className="h-4 w-4 opacity-50 shrink-0 ml-2" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[320px] p-0" align="start">
          <div className="p-2 border-b flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <Input
              placeholder={searchPlaceholder}
              value={q}
              onChange={e => setQ(e.target.value)}
              className="h-8 border-0 focus-visible:ring-0 px-1"
              autoFocus
            />
            {selected.length > 0 && (
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onChange([])}>
                <X className="h-3 w-3 mr-1" />Limpar
              </Button>
            )}
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">Nenhum resultado</p>
            ) : filtered.map(o => (
              <label key={o.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted cursor-pointer text-sm">
                <Checkbox checked={selected.includes(o.id)} onCheckedChange={() => toggle(o.id)} />
                <span className="truncate">{o.label}</span>
              </label>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export default function MerchAuditoria() {
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [filterPromoters, setFilterPromoters] = useState<string[]>([]);
  const [filterCities, setFilterCities] = useState<string[]>([]);
  const [filterSupervisors, setFilterSupervisors] = useState<string[]>([]);
  const [filterBrands, setFilterBrands] = useState<string[]>([]);

  const { data: routes = [] } = useMerchRoutes({ date_from: dateFrom, date_to: dateTo });
  const { data: auditLogs = [] } = useRouteAuditLogs(selectedRouteId || undefined);
  const { data: authors = [] } = useRouteAuthors(selectedRouteId || undefined);
  const { data: assignHistory = [] } = useRouteAssignmentHistory(selectedRouteId || undefined);
  const { data: employees = [] } = useEmployees();
  const { data: brands = [] } = useBrands();

  const promoterOptions: Option[] = useMemo(
    () => (employees as any[]).filter(e => e?.id).map(e => ({ id: e.id, label: e.full_name || '—' })),
    [employees]
  );

  const supervisorOptions: Option[] = useMemo(() => {
    const map = new Map<string, string>();
    (routes as any[]).forEach((r: any) => {
      if (r.supervisor_id) map.set(r.supervisor_id, r.supervisor_name || '—');
    });
    return Array.from(map.entries()).map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [routes]);

  const cityOptions: Option[] = useMemo(() => {
    const set = new Set<string>();
    (routes as any[]).forEach((r: any) => { if (r.pdv_city) set.add(r.pdv_city); });
    return Array.from(set).sort().map(c => ({ id: c, label: c }));
  }, [routes]);

  const brandOptions: Option[] = useMemo(
    () => (brands as any[]).filter(b => b?.id).map(b => ({ id: b.id, label: b.name || '—' })),
    [brands]
  );

  const filteredRoutes = useMemo(() => {
    return (routes as any[]).filter((r: any) => {
      if (filterPromoters.length && !filterPromoters.includes(r.promoter_id)) return false;
      if (filterSupervisors.length && !filterSupervisors.includes(r.supervisor_id)) return false;
      if (filterCities.length && !filterCities.includes(r.pdv_city)) return false;
      if (filterBrands.length) {
        const rbIds = (r.route_brands || []).map((rb: any) => rb.brand_id);
        const ids = [r.brand_id, ...rbIds].filter(Boolean);
        if (!ids.some((id: string) => filterBrands.includes(id))) return false;
      }
      return true;
    });
  }, [routes, filterPromoters, filterSupervisors, filterCities, filterBrands]);

  const anyFilter = filterPromoters.length + filterSupervisors.length + filterCities.length + filterBrands.length > 0;
  const clearAll = () => { setFilterPromoters([]); setFilterSupervisors([]); setFilterCities([]); setFilterBrands([]); };

  return (
    <MainLayout>
      <div className="space-y-4">
        {/* Filters */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex flex-wrap gap-3 items-end">
              <MultiSelectFilter
                placeholder="Todos os promotores"
                searchPlaceholder="Digite o nome do promotor..."
                options={promoterOptions}
                selected={filterPromoters}
                onChange={setFilterPromoters}
                minWidth={220}
              />
              <MultiSelectFilter
                placeholder="Todos os supervisores"
                searchPlaceholder="Digite o nome do supervisor..."
                options={supervisorOptions}
                selected={filterSupervisors}
                onChange={setFilterSupervisors}
              />
              <MultiSelectFilter
                placeholder="Todas as cidades"
                searchPlaceholder="Digite a cidade..."
                options={cityOptions}
                selected={filterCities}
                onChange={setFilterCities}
              />
              <MultiSelectFilter
                placeholder="Todas as marcas"
                searchPlaceholder="Digite a marca..."
                options={brandOptions}
                selected={filterBrands}
                onChange={setFilterBrands}
              />
              <div><Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-36" /></div>
              <div><Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-36" /></div>
              {anyFilter && (
                <Button variant="ghost" size="sm" onClick={clearAll} className="text-xs">
                  <X className="h-3 w-3 mr-1" />Limpar filtros
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Routes list */}
        <div className="grid gap-3">
          {filteredRoutes.map((r: any) => (
            <Card key={r.id} className="cursor-pointer hover:border-primary/30 transition-colors" onClick={() => setSelectedRouteId(r.id)}>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{r.pdv_name || 'PDV'}</span>
                      {r.pdv_city && <Badge variant="secondary" className="text-[10px]">{r.pdv_city}</Badge>}
                      <Badge variant="outline" className="text-[10px]">{r.brand_name}</Badge>
                      <Badge className="text-[10px]">{r.status}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 flex gap-3 flex-wrap">
                      <span className="flex items-center gap-1"><User className="h-3 w-3" />{r.promoter_name}</span>
                      {r.supervisor_name && <span className="flex items-center gap-1">Sup: {r.supervisor_name}</span>}
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{r.visit_date}</span>
                    </div>
                  </div>
                  <Eye className="h-4 w-4 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          ))}
          {filteredRoutes.length === 0 && (
            <Card><CardContent className="py-12 text-center text-muted-foreground">
              <Shield className="h-12 w-12 mx-auto mb-3 opacity-40" />
              <p>Nenhuma rota encontrada no período</p>
            </CardContent></Card>
          )}
        </div>
      </div>

      {/* Audit Detail Dialog */}
      <Dialog open={!!selectedRouteId} onOpenChange={() => setSelectedRouteId(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" /> Auditoria da Rota
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Assignment History */}
            {(assignHistory as any[]).length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><ArrowLeftRight className="h-4 w-4" /> Alterações de Equipe</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {(assignHistory as any[]).map((h: any, i: number) => (
                      <div key={i} className="flex items-start gap-2 text-xs p-2 rounded border">
                        <Badge variant="outline" className="text-[9px] mt-0.5">{h.action}</Badge>
                        <div className="flex-1">
                          <p><b>{h.employee_name || h.employee_id}</b></p>
                          {h.reason && <p className="text-muted-foreground">{h.reason}</p>}
                          <p className="text-muted-foreground">{h.changed_by_name || 'Sistema'} • {h.created_at ? new Date(h.created_at).toLocaleString('pt-BR') : ''}</p>
                          {h.progress_at_change > 0 && <p className="text-muted-foreground">Progresso no momento: {h.progress_at_change}%</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Execution Authors */}
            {(authors as any[]).length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><User className="h-4 w-4" /> Histórico de Execução por Autor</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Ação</TableHead>
                        <TableHead className="text-xs">Autor</TableHead>
                        <TableHead className="text-xs">Perfil</TableHead>
                        <TableHead className="text-xs">Origem</TableHead>
                        <TableHead className="text-xs">Data/Hora</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(authors as any[]).map((a: any, i: number) => (
                        <TableRow key={i}>
                          <TableCell className="text-xs">{ACTION_LABELS[a.action] || a.action}</TableCell>
                          <TableCell className="text-xs">{a.performer_name || '—'}</TableCell>
                          <TableCell className="text-xs"><Badge variant="outline" className="text-[9px]">{a.performer_role}</Badge></TableCell>
                          <TableCell className="text-xs">
                            {a.source === 'web' ? '🖥️ Web' : '📱 App'}
                          </TableCell>
                          <TableCell className="text-xs">{a.created_at ? new Date(a.created_at).toLocaleString('pt-BR') : ''}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {/* Audit Logs */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><Edit className="h-4 w-4" /> Log de Edições</CardTitle>
              </CardHeader>
              <CardContent>
                {(auditLogs as any[]).length > 0 ? (
                  <div className="space-y-2">
                    {(auditLogs as any[]).map((log: any, i: number) => (
                      <div key={i} className="p-3 rounded-lg border text-xs space-y-1">
                        <div className="flex items-center gap-2 justify-between">
                          <div className="flex items-center gap-2">
                            <Badge variant={log.editor_role === 'supervisor' ? 'default' : 'secondary'} className="text-[9px]">
                              {log.editor_role === 'supervisor' ? '🖥️ Supervisor' : '📱 Promotor'}
                            </Badge>
                            <span className="font-medium">{FIELD_LABELS[log.field_changed] || log.field_changed}</span>
                          </div>
                          {log.route_was_completed && (
                            <Badge variant="destructive" className="text-[9px]">
                              <AlertTriangle className="h-3 w-3 mr-1" /> Rota já concluída
                            </Badge>
                          )}
                        </div>
                        {log.old_value && <p className="text-muted-foreground">Antes: <span className="line-through">{log.old_value}</span></p>}
                        {log.new_value && <p>Depois: <b>{log.new_value}</b></p>}
                        {log.reason && <p className="text-muted-foreground">Motivo: {log.reason}</p>}
                        <p className="text-muted-foreground">
                          {log.editor_name || log.editor_email || 'Sistema'} • {log.source === 'web' ? 'via Web' : 'via App'}
                          {log.created_at && ` • ${new Date(log.created_at).toLocaleString('pt-BR')}`}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">Nenhuma edição registrada para esta rota</p>
                )}
              </CardContent>
            </Card>
          </div>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
