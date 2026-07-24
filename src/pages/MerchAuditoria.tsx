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
import { usePDVs } from "@/hooks/use-promotor";
import { useEmployees } from "@/hooks/use-rh";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { Shield, Eye, Clock, User, Edit, Camera, ArrowLeftRight, FileText, AlertTriangle, ChevronDown, X, Search } from "lucide-react";

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

export default function MerchAuditoria() {
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [filterPromoters, setFilterPromoters] = useState<string[]>([]);
  const [promoterSearch, setPromoterSearch] = useState('');
  const [promoterOpen, setPromoterOpen] = useState(false);

  const { data: routes = [] } = useMerchRoutes({ date_from: dateFrom, date_to: dateTo });
  const { data: auditLogs = [] } = useRouteAuditLogs(selectedRouteId || undefined);
  const { data: authors = [] } = useRouteAuthors(selectedRouteId || undefined);
  const { data: assignHistory = [] } = useRouteAssignmentHistory(selectedRouteId || undefined);
  const { data: employees = [] } = useEmployees();
  const { data: brands = [] } = useBrands();

  const filteredRoutes = useMemo(() => {
    if (!filterPromoters.length) return routes as any[];
    return (routes as any[]).filter((r: any) => filterPromoters.includes(r.promoter_id));
  }, [routes, filterPromoters]);

  const filteredEmployees = useMemo(() => {
    const q = promoterSearch.trim().toLowerCase();
    const list = (employees as any[]).filter((e: any) => e?.id);
    if (!q) return list;
    return list.filter((e: any) => (e.full_name || '').toLowerCase().includes(q));
  }, [employees, promoterSearch]);

  const togglePromoter = (id: string) => {
    setFilterPromoters(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const promoterLabel = filterPromoters.length === 0
    ? 'Todos os promotores'
    : filterPromoters.length === 1
      ? ((employees as any[]).find((e: any) => e.id === filterPromoters[0])?.full_name || '1 selecionado')
      : `${filterPromoters.length} selecionados`;

  return (
    <MainLayout>
      <div className="space-y-4">
        {/* Filters */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex flex-wrap gap-3 items-end">
              <div className="flex-1 min-w-[220px]">
                <Popover open={promoterOpen} onOpenChange={setPromoterOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-between font-normal">
                      <span className="truncate">{promoterLabel}</span>
                      <ChevronDown className="h-4 w-4 opacity-50 shrink-0 ml-2" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[320px] p-0" align="start">
                    <div className="p-2 border-b flex items-center gap-2">
                      <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                      <Input
                        placeholder="Digite o nome do promotor..."
                        value={promoterSearch}
                        onChange={e => setPromoterSearch(e.target.value)}
                        className="h-8 border-0 focus-visible:ring-0 px-1"
                        autoFocus
                      />
                      {filterPromoters.length > 0 && (
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setFilterPromoters([])}>
                          <X className="h-3 w-3 mr-1" />Limpar
                        </Button>
                      )}
                    </div>
                    <div className="max-h-72 overflow-y-auto py-1">
                      {filteredEmployees.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-4">Nenhum promotor encontrado</p>
                      ) : filteredEmployees.map((e: any) => (
                        <label key={e.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted cursor-pointer text-sm">
                          <Checkbox
                            checked={filterPromoters.includes(e.id)}
                            onCheckedChange={() => togglePromoter(e.id)}
                          />
                          <span className="truncate">{e.full_name}</span>
                        </label>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              <div><Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-36" /></div>
              <div><Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-36" /></div>
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
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{r.pdv_name || 'PDV'}</span>
                      <Badge variant="outline" className="text-[10px]">{r.brand_name}</Badge>
                      <Badge className="text-[10px]">{r.status}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 flex gap-3">
                      <span className="flex items-center gap-1"><User className="h-3 w-3" />{r.promoter_name}</span>
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
