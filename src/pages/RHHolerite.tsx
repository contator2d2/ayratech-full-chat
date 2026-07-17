import { useState, useRef } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { usePayslips, useCreatePayslip, useUpdatePayslip, useImportPayslip, useEmployees, useBulkMatchPayslips, useBulkImportPayslips } from "@/hooks/use-rh";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Plus, FileText, Upload, PenTool, Trash2, CheckCircle2, AlertCircle, FolderUp } from "lucide-react";
import { format } from "date-fns";
import { api, API_URL, getAuthToken } from "@/lib/api";

const STATUS_COLORS: Record<string, string> = {
  rascunho: "bg-yellow-500/10 text-yellow-700 border-yellow-200",
  gerado: "bg-blue-500/10 text-blue-700 border-blue-200",
  pago: "bg-green-500/10 text-green-700 border-green-200",
};

export default function RHHolerite() {
  const [monthFilter, setMonthFilter] = useState(format(new Date(), "yyyy-MM"));
  const [employeeFilter, setEmployeeFilter] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [form, setForm] = useState<any>({
    employee_id: "", reference_month: format(new Date(), "yyyy-MM"), payment_type: "mensal",
    gross_salary: 0, earnings: [], total_earnings: 0, deductions: [], total_deductions: 0,
    net_salary: 0, fgts_value: 0, inss_value: 0, irrf_value: 0, payment_date: "", status: "rascunho", notes: "",
  });
  const [importForm, setImportForm] = useState<any>({
    employee_id: "", reference_month: format(new Date(), "yyyy-MM"), payment_type: "mensal",
    notes: "", send_for_signature: true,
  });
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const { data: payslips = [], isLoading } = usePayslips({
    reference_month: monthFilter || undefined,
    employee_id: employeeFilter || undefined,
  });
  const { data: employees = [] } = useEmployees({ status: "ativo" });
  const createMut = useCreatePayslip();
  const importMut = useImportPayslip();

  const fmtCurrency = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

  const handleSave = async () => {
    if (!form.employee_id || !form.reference_month) { toast({ title: "Preencha colaborador e mês", variant: "destructive" }); return; }
    try {
      await createMut.mutateAsync(form);
      toast({ title: "Holerite criado!" });
      setDialogOpen(false);
    } catch { toast({ title: "Erro ao criar holerite", variant: "destructive" }); }
  };

  const handleImport = async () => {
    if (!importForm.employee_id || !importForm.reference_month || !importFile) {
      toast({ title: "Selecione colaborador, mês e arquivo PDF", variant: "destructive" });
      return;
    }
    setImporting(true);
    try {
      // Upload file first
      const formData = new FormData();
      formData.append("file", importFile);
      const uploadRes = await fetch("/api/uploads", { method: "POST", body: formData, credentials: "include" });
      if (!uploadRes.ok) throw new Error("Upload falhou");
      const uploadData = await uploadRes.json();
      const pdf_url = uploadData.url || uploadData.file_url || uploadData.path;

      await importMut.mutateAsync({
        ...importForm,
        pdf_url,
      });
      toast({ title: "Holerite importado!", description: importForm.send_for_signature ? "Enviado para assinatura" : undefined });
      setImportDialogOpen(false);
      setImportFile(null);
      setImportForm({ employee_id: "", reference_month: format(new Date(), "yyyy-MM"), payment_type: "mensal", notes: "", send_for_signature: true });
    } catch {
      toast({ title: "Erro ao importar holerite", variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  const setField = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));

  const recalcNet = (f: any) => {
    const net = (parseFloat(f.gross_salary) || 0) + (parseFloat(f.total_earnings) || 0) - (parseFloat(f.total_deductions) || 0);
    return Math.max(0, net);
  };

  const totalLiquido = payslips.reduce((s: number, p: any) => s + (parseFloat(p.net_salary) || 0), 0);
  const totalBruto = payslips.reduce((s: number, p: any) => s + (parseFloat(p.gross_salary) || 0), 0);

  return (
    <MainLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><FileText className="h-6 w-6 text-primary" /> Holerites</h1>
            <p className="text-sm text-muted-foreground">Demonstrativos de pagamento</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setImportDialogOpen(true)} className="gap-2"><Upload className="h-4 w-4" /> Importar PDF</Button>
            <Button onClick={() => setDialogOpen(true)} className="gap-2"><Plus className="h-4 w-4" /> Gerar Holerite</Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-foreground">{payslips.length}</p><p className="text-xs text-muted-foreground">Holerites</p></CardContent></Card>
          <Card><CardContent className="p-4 text-center"><p className="text-lg font-bold text-primary">{fmtCurrency(totalBruto)}</p><p className="text-xs text-muted-foreground">Total Bruto</p></CardContent></Card>
          <Card><CardContent className="p-4 text-center"><p className="text-lg font-bold text-green-600">{fmtCurrency(totalLiquido)}</p><p className="text-xs text-muted-foreground">Total Líquido</p></CardContent></Card>
          <Card><CardContent className="p-4 text-center"><p className="text-lg font-bold text-yellow-600">{payslips.filter((p: any) => p.status === "rascunho").length}</p><p className="text-xs text-muted-foreground">Rascunhos</p></CardContent></Card>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <Input type="month" value={monthFilter} onChange={e => setMonthFilter(e.target.value)} className="w-48" />
          <Select value={employeeFilter || "__all__"} onValueChange={v => setEmployeeFilter(v === "__all__" ? "" : v)}>
            <SelectTrigger className="w-60"><SelectValue placeholder="Todos os colaboradores" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos</SelectItem>
              {employees.map((e: any) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Colaborador</TableHead>
                  <TableHead className="hidden md:table-cell">Cargo</TableHead>
                  <TableHead>Mês Ref.</TableHead>
                  <TableHead className="hidden md:table-cell">Bruto</TableHead>
                  <TableHead className="hidden lg:table-cell">Descontos</TableHead>
                  <TableHead>Líquido</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">PDF</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
                ) : payslips.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Nenhum holerite encontrado</TableCell></TableRow>
                ) : payslips.map((p: any) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.employee_name}</TableCell>
                    <TableCell className="hidden md:table-cell text-sm">{p.position || "—"}</TableCell>
                    <TableCell>{p.reference_month}</TableCell>
                    <TableCell className="hidden md:table-cell">{fmtCurrency(p.gross_salary)}</TableCell>
                    <TableCell className="hidden lg:table-cell text-red-600">{fmtCurrency(p.total_deductions)}</TableCell>
                    <TableCell className="font-medium text-green-700">{fmtCurrency(p.net_salary)}</TableCell>
                    <TableCell><Badge className={STATUS_COLORS[p.status] || ""}>{p.status}</Badge></TableCell>
                    <TableCell className="hidden md:table-cell">
                      {p.pdf_url ? (
                        <a href={p.pdf_url} target="_blank" rel="noreferrer" className="text-primary hover:underline text-sm flex items-center gap-1">
                          <PenTool className="h-3 w-3" /> Ver PDF
                        </a>
                      ) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Generate Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Gerar Holerite</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Colaborador *</Label>
              <Select value={form.employee_id} onValueChange={v => {
                const emp = employees.find((e: any) => e.id === v);
                setField("employee_id", v);
                if (emp) setField("gross_salary", emp.salary || 0);
              }}>
                <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>
                  {employees.map((e: any) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Mês Referência *</Label><Input type="month" value={form.reference_month} onChange={e => setField("reference_month", e.target.value)} /></div>
              <div><Label>Data Pagamento</Label><Input type="date" value={form.payment_date} onChange={e => setField("payment_date", e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Salário Bruto (R$)</Label><Input type="number" value={form.gross_salary} onChange={e => setField("gross_salary", e.target.value)} /></div>
              <div><Label>Tipo</Label>
                <Select value={form.payment_type} onValueChange={v => setField("payment_type", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mensal">Mensal</SelectItem>
                    <SelectItem value="adiantamento">Adiantamento</SelectItem>
                    <SelectItem value="13o">13º Salário</SelectItem>
                    <SelectItem value="ferias">Férias</SelectItem>
                    <SelectItem value="rescisao">Rescisão</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>INSS (R$)</Label><Input type="number" value={form.inss_value} onChange={e => setField("inss_value", e.target.value)} /></div>
              <div><Label>IRRF (R$)</Label><Input type="number" value={form.irrf_value} onChange={e => setField("irrf_value", e.target.value)} /></div>
              <div><Label>FGTS (R$)</Label><Input type="number" value={form.fgts_value} onChange={e => setField("fgts_value", e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Total Proventos (R$)</Label><Input type="number" value={form.total_earnings} onChange={e => setField("total_earnings", e.target.value)} /></div>
              <div><Label>Total Descontos (R$)</Label><Input type="number" value={form.total_deductions} onChange={e => setField("total_deductions", e.target.value)} /></div>
            </div>
            <div className="p-3 bg-muted rounded-lg text-center">
              <p className="text-xs text-muted-foreground">Salário Líquido</p>
              <p className="text-xl font-bold text-green-700">{fmtCurrency(recalcNet(form))}</p>
            </div>
            <div><Label>Observações</Label><Input value={form.notes} onChange={e => setField("notes", e.target.value)} /></div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={createMut.isPending}>{createMut.isPending ? "Salvando..." : "Gerar"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Import Dialog */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Upload className="h-5 w-5" /> Importar Holerite (PDF)</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Colaborador *</Label>
              <Select value={importForm.employee_id} onValueChange={v => setImportForm((p: any) => ({ ...p, employee_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecionar colaborador" /></SelectTrigger>
                <SelectContent>
                  {employees.map((e: any) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Mês Referência *</Label><Input type="month" value={importForm.reference_month} onChange={e => setImportForm((p: any) => ({ ...p, reference_month: e.target.value }))} /></div>
              <div><Label>Tipo</Label>
                <Select value={importForm.payment_type} onValueChange={v => setImportForm((p: any) => ({ ...p, payment_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mensal">Mensal</SelectItem>
                    <SelectItem value="adiantamento">Adiantamento</SelectItem>
                    <SelectItem value="13o">13º Salário</SelectItem>
                    <SelectItem value="ferias">Férias</SelectItem>
                    <SelectItem value="rescisao">Rescisão</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Arquivo PDF *</Label>
              <div
                className="mt-1 border-2 border-dashed border-muted-foreground/30 rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
                onDrop={e => { e.preventDefault(); e.stopPropagation(); const f = e.dataTransfer.files[0]; if (f?.type === 'application/pdf') setImportFile(f); }}
              >
                <input ref={fileInputRef} type="file" accept=".pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) setImportFile(f); }} />
                {importFile ? (
                  <div className="flex items-center justify-center gap-2 text-primary">
                    <FileText className="h-5 w-5" />
                    <span className="font-medium">{importFile.name}</span>
                    <span className="text-xs text-muted-foreground">({(importFile.size / 1024).toFixed(0)} KB)</span>
                  </div>
                ) : (
                  <div>
                    <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">Clique ou arraste o PDF do holerite aqui</p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <div className="flex items-center gap-2">
                <PenTool className="h-4 w-4 text-primary" />
                <div>
                  <p className="text-sm font-medium">Enviar para assinatura</p>
                  <p className="text-xs text-muted-foreground">O colaborador receberá o holerite para assinar digitalmente</p>
                </div>
              </div>
              <Switch
                checked={importForm.send_for_signature}
                onCheckedChange={v => setImportForm((p: any) => ({ ...p, send_for_signature: v }))}
              />
            </div>

            <div><Label>Observações</Label><Input value={importForm.notes} onChange={e => setImportForm((p: any) => ({ ...p, notes: e.target.value }))} placeholder="Opcional" /></div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setImportDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleImport} disabled={importing}>{importing ? "Importando..." : "Importar e Enviar"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
