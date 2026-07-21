import { useMemo, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useBrands } from "@/hooks/use-merchandising";
import {
  useStockCountExecutions, useStockCountExecutionDetail, useResendStockCountEmail,
} from "@/hooks/use-stock-count";
import { BarChart3, Search, Mail, Download, Boxes, FileText } from "lucide-react";
import { toast } from "sonner";
import { StockCountPdfDialog } from "@/components/merch/StockCountPdfDialog";


const STATUS_META: Record<string, { label: string; className: string }> = {
  completed: { label: "Concluída", className: "bg-emerald-100 text-emerald-800" },
  in_progress: { label: "Em andamento", className: "bg-amber-100 text-amber-800" },
  pending: { label: "Pendente", className: "bg-slate-100 text-slate-700" },
  postponed: { label: "Adiada", className: "bg-blue-100 text-blue-700" },
  justified: { label: "Justificada", className: "bg-purple-100 text-purple-700" },
};

function fmtDate(d?: string | null) {
  if (!d) return "-";
  try {
    return new Date(d).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  } catch { return String(d); }
}

function fmtNum(v: any) {
  if (v === null || v === undefined || v === "") return "-";
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "-";
}

export default function MerchContagemDashboard() {
  const today = new Date();
  const past = new Date(); past.setDate(today.getDate() - 30);
  const toIso = (d: Date) => d.toISOString().slice(0, 10);

  const [filters, setFilters] = useState({
    from: toIso(past),
    to: toIso(today),
    brand_id: "",
    status: "",
    search: "",
  });

  const { data: brands = [] } = useBrands();
  const { data: executions = [], isLoading, refetch } = useStockCountExecutions({
    from: filters.from,
    to: filters.to,
    brand_id: filters.brand_id || undefined,
    status: filters.status || undefined,
  });

  const filtered = useMemo(() => {
    const q = filters.search.toLowerCase().trim();
    if (!q) return executions as any[];
    return (executions as any[]).filter((e) =>
      [e.brand_name, e.pdv_name, e.promoter_name].some((v) =>
        (v || "").toLowerCase().includes(q),
      ),
    );
  }, [executions, filters.search]);

  const totals = useMemo(() => {
    let done = 0, pending = 0, items = 0;
    for (const e of filtered as any[]) {
      if (e.status === "completed") done++; else pending++;
      items += Number(e.total_items) || 0;
    }
    return { total: filtered.length, done, pending, items };
  }, [filtered]);

  const [detailId, setDetailId] = useState<string | null>(null);
  const [extraEmails, setExtraEmails] = useState("");
  const [pdfOpen, setPdfOpen] = useState(false);
  const { data: detail } = useStockCountExecutionDetail(detailId || undefined);
  const resend = useResendStockCountEmail();


  const handleExportCsv = () => {
    const header = ["Data", "Marca", "PDV", "Promotor", "Status", "Itens", "Progresso %"];
    const lines = (filtered as any[]).map((e) => [
      fmtDate(e.completed_at || e.updated_at),
      e.brand_name || "",
      e.pdv_name || "",
      e.promoter_name || "",
      STATUS_META[e.status]?.label || e.status,
      `${e.completed_items || 0}/${e.total_items || 0}`,
      fmtNum(e.progress_pct),
    ]);
    const csv = [header, ...lines]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `contagem-estoque-${filters.from}-${filters.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleResend = async () => {
    if (!detailId) return;
    try {
      const res: any = await resend.mutateAsync({ execution_id: detailId, extra_emails: extraEmails || undefined });
      if (res.skipped) toast.info(`Não enviado: ${res.skipped}`);
      else if (res.sent?.length) toast.success(`E-mail enviado para ${res.sent.length} destinatário(s)`);
      else toast.warning("Nenhum destinatário válido");
      setExtraEmails("");
    } catch (e: any) { toast.error(e?.message || "Erro ao enviar"); }
  };

  return (
    <MainLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <BarChart3 className="h-6 w-6 text-primary" /> Dashboard de Contagem
            </h1>
            <p className="text-sm text-muted-foreground">
              Histórico de contagens de estoque realizadas pelos promotores. Reenvie o resumo por e-mail quando precisar.
            </p>
          </div>
          <Button variant="outline" onClick={handleExportCsv} disabled={!filtered.length}>
            <Download className="h-4 w-4 mr-2" /> Exportar CSV
          </Button>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Filtros</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
              <div>
                <Label className="text-xs">De</Label>
                <Input type="date" value={filters.from}
                  onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Até</Label>
                <Input type="date" value={filters.to}
                  onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Marca</Label>
                <Select value={filters.brand_id || "__all"}
                  onValueChange={(v) => setFilters({ ...filters, brand_id: v === "__all" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all">Todas</SelectItem>
                    {(brands as any[]).map((b) => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Status</Label>
                <Select value={filters.status || "__all"}
                  onValueChange={(v) => setFilters({ ...filters, status: v === "__all" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all">Todos</SelectItem>
                    {Object.entries(STATUS_META).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Buscar (marca, PDV, promotor)</Label>
                <div className="relative">
                  <Search className="h-3.5 w-3.5 absolute left-2 top-2.5 text-muted-foreground" />
                  <Input className="pl-7" value={filters.search}
                    onChange={(e) => setFilters({ ...filters, search: e.target.value })} />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Execuções</p><p className="text-2xl font-bold">{totals.total}</p></CardContent></Card>
          <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Concluídas</p><p className="text-2xl font-bold text-emerald-600">{totals.done}</p></CardContent></Card>
          <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Pendentes/Adiadas</p><p className="text-2xl font-bold text-amber-600">{totals.pending}</p></CardContent></Card>
          <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Itens contados</p><p className="text-2xl font-bold">{totals.items}</p></CardContent></Card>
        </div>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Boxes className="h-4 w-4" /> Execuções
            </CardTitle>
            <Button size="sm" variant="ghost" onClick={() => refetch()}>Atualizar</Button>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Carregando...</p>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma execução encontrada no período.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground border-b">
                      <th className="p-2">Conclusão</th>
                      <th className="p-2">Marca</th>
                      <th className="p-2">PDV</th>
                      <th className="p-2">Promotor</th>
                      <th className="p-2">Status</th>
                      <th className="p-2 text-right">Itens</th>
                      <th className="p-2 text-right">Progresso</th>
                      <th className="p-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(filtered as any[]).map((e) => {
                      const meta = STATUS_META[e.status] || { label: e.status, className: "bg-slate-100" };
                      return (
                        <tr key={e.id} className="border-b hover:bg-muted/40">
                          <td className="p-2 whitespace-nowrap">{fmtDate(e.completed_at || e.updated_at)}</td>
                          <td className="p-2">{e.brand_name || "-"}</td>
                          <td className="p-2">{e.pdv_name || "-"}</td>
                          <td className="p-2">{e.promoter_name || "-"}</td>
                          <td className="p-2"><Badge className={meta.className}>{meta.label}</Badge></td>
                          <td className="p-2 text-right">{e.completed_items || 0}/{e.total_items || 0}</td>
                          <td className="p-2 text-right">{fmtNum(e.progress_pct)}%</td>
                          <td className="p-2 text-right">
                            <Button size="sm" variant="outline" onClick={() => { setDetailId(e.id); setExtraEmails(""); }}>
                              Detalhes
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!detailId} onOpenChange={(v) => !v && setDetailId(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes da Contagem</DialogTitle>
          </DialogHeader>
          {!detail ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                <div><p className="text-xs text-muted-foreground">Marca</p><p className="font-medium">{detail.brand_name}</p></div>
                <div><p className="text-xs text-muted-foreground">PDV</p><p className="font-medium">{detail.pdv_name}</p></div>
                <div><p className="text-xs text-muted-foreground">Promotor</p><p className="font-medium">{detail.promoter_name}</p></div>
                <div><p className="text-xs text-muted-foreground">Conclusão</p><p className="font-medium">{fmtDate(detail.completed_at || detail.updated_at)}</p></div>
                <div><p className="text-xs text-muted-foreground">Status</p><p className="font-medium">{STATUS_META[detail.status]?.label || detail.status}</p></div>
                <div><p className="text-xs text-muted-foreground">Progresso</p><p className="font-medium">{detail.completed_items || 0}/{detail.total_items || 0} ({fmtNum(detail.progress_pct)}%)</p></div>
              </div>

              <ScrollArea className="max-h-64 border rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="p-2 text-left">Produto</th>
                      <th className="p-2 text-right">Frente/Gôndola</th>
                      <th className="p-2 text-right">Estoque</th>
                      <th className="p-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(detail.items || []).map((it: any) => (
                      <tr key={it.id} className="border-b">
                        <td className="p-2">{it.product_name}{it.sku && <span className="text-xs text-muted-foreground"> ({it.sku})</span>}</td>
                        <td className="p-2 text-right">{fmtNum(it.final_store)}</td>
                        <td className="p-2 text-right">{fmtNum(it.final_stock)}</td>
                        <td className="p-2 text-right font-medium">{fmtNum(it.quantity)}</td>
                      </tr>
                    ))}
                    {(!detail.items || detail.items.length === 0) && (
                      <tr><td colSpan={4} className="p-4 text-center text-muted-foreground text-xs">Sem itens</td></tr>
                    )}
                  </tbody>
                </table>
              </ScrollArea>

              <div className="border-t pt-3 space-y-2">
                <Label className="text-sm flex items-center gap-2"><Mail className="h-4 w-4" /> Reenviar resumo por e-mail</Label>
                <p className="text-[11px] text-muted-foreground">
                  Envia o resumo para o e-mail da marca ({detail.brand_email || "não cadastrado"}) e para os e-mails abaixo (opcional).
                </p>
                <Input placeholder="email1@ex.com, email2@ex.com" value={extraEmails}
                  onChange={(e) => setExtraEmails(e.target.value)} />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 flex-wrap">
            <Button variant="outline" onClick={() => setDetailId(null)}>Fechar</Button>
            <Button variant="outline" onClick={() => setPdfOpen(true)} disabled={!detail}>
              <FileText className="h-4 w-4 mr-2" /> Gerar PDF / CSV
            </Button>
            <Button onClick={handleResend} disabled={resend.isPending || !detailId}>
              <Mail className="h-4 w-4 mr-2" /> {resend.isPending ? "Enviando..." : "Enviar e-mail"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <StockCountPdfDialog open={pdfOpen} onOpenChange={setPdfOpen} detail={detail as any} />
    </MainLayout>
  );
}

