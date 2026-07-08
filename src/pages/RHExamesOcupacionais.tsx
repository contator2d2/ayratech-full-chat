import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, Trash2, Pencil, Stethoscope } from "lucide-react";
import { useHealthExams, useSaveHealthExam, useDeleteHealthExam } from "@/hooks/use-rh-extended";
import { useEmployees } from "@/hooks/use-rh";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

const EXAM_TYPES = [
  { v: 'admissional', l: 'Admissional' },
  { v: 'periodico', l: 'Periódico' },
  { v: 'retorno', l: 'Retorno ao trabalho' },
  { v: 'mudanca_funcao', l: 'Mudança de função' },
  { v: 'demissional', l: 'Demissional' },
];
const RESULTS = [
  { v: 'apto', l: 'Apto' },
  { v: 'apto_restricao', l: 'Apto com restrição' },
  { v: 'inapto', l: 'Inapto' },
];
const EMPTY: any = { employee_id: '', exam_type: 'periodico', exam_date: '', expiry_date: '', result: 'apto', clinic_name: '', doctor_name: '', doctor_crm: '', file_url: '', notes: '' };

const fmtDate = (v: any) => { if (!v) return "—"; try { return format(parseISO(String(v).slice(0,10) + 'T12:00:00'), 'dd/MM/yyyy', { locale: ptBR }); } catch { return "—"; } };

export default function RHExamesOcupacionais() {
  const [tab, setTab] = useState<'todos' | 'vencendo' | 'vencido'>('todos');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ ...EMPTY });
  const { data: exams = [] } = useHealthExams(tab === 'todos' ? undefined : { status: tab });
  const { data: employees = [] } = useEmployees({ status: 'ativo' });
  const save = useSaveHealthExam();
  const del = useDeleteHealthExam();

  const openNew = () => { setForm({ ...EMPTY }); setOpen(true); };
  const openEdit = (r: any) => {
    setForm({ ...r, exam_date: r.exam_date?.slice(0,10) || '', expiry_date: r.expiry_date?.slice(0,10) || '' });
    setOpen(true);
  };
  const submit = async () => { await save.mutateAsync(form); setOpen(false); };

  return (
    <MainLayout>
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><Stethoscope className="h-6 w-6" />Exames Ocupacionais</h1>
            <p className="text-sm text-muted-foreground">ASOs — Admissional, periódico, demissional, mudança de função, retorno</p>
          </div>
          <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" />Novo ASO</Button>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList>
            <TabsTrigger value="todos">Todos</TabsTrigger>
            <TabsTrigger value="vencendo">Vencendo (30d)</TabsTrigger>
            <TabsTrigger value="vencido">Vencidos</TabsTrigger>
          </TabsList>
          <TabsContent value={tab} className="mt-4">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Colaborador</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Data exame</TableHead>
                      <TableHead>Vencimento</TableHead>
                      <TableHead>Resultado</TableHead>
                      <TableHead>Clínica</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {exams.length === 0 ? (
                      <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhum registro.</TableCell></TableRow>
                    ) : exams.map((r: any) => {
                      const expired = r.expiry_date && new Date(r.expiry_date) < new Date();
                      return (
                        <TableRow key={r.id}>
                          <TableCell>
                            <div className="font-medium">{r.employee_name}</div>
                            <div className="text-xs text-muted-foreground">{r.position}</div>
                          </TableCell>
                          <TableCell className="capitalize">{r.exam_type?.replace('_', ' ')}</TableCell>
                          <TableCell>{fmtDate(r.exam_date)}</TableCell>
                          <TableCell><Badge variant={expired ? 'destructive' : 'secondary'}>{fmtDate(r.expiry_date)}</Badge></TableCell>
                          <TableCell><Badge variant={r.result === 'inapto' ? 'destructive' : r.result === 'apto_restricao' ? 'secondary' : 'outline'}>{r.result}</Badge></TableCell>
                          <TableCell className="text-sm">{r.clinic_name || '—'}</TableCell>
                          <TableCell className="text-right">
                            <Button size="icon" variant="ghost" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                            <Button size="icon" variant="ghost" onClick={() => confirm('Excluir?') && del.mutate(r.id)}><Trash2 className="h-4 w-4" /></Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>{form.id ? 'Editar ASO' : 'Novo ASO'}</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Colaborador</Label>
                <Select value={form.employee_id} onValueChange={(v) => setForm({ ...form, employee_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{employees.map((e: any) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Tipo</Label>
                <Select value={form.exam_type} onValueChange={(v) => setForm({ ...form, exam_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{EXAM_TYPES.map(t => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Resultado</Label>
                <Select value={form.result} onValueChange={(v) => setForm({ ...form, result: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{RESULTS.map(t => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Data do exame</Label><Input type="date" value={form.exam_date} onChange={(e) => setForm({ ...form, exam_date: e.target.value })} /></div>
              <div><Label>Vencimento</Label><Input type="date" value={form.expiry_date} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} /></div>
              <div><Label>Clínica</Label><Input value={form.clinic_name || ''} onChange={(e) => setForm({ ...form, clinic_name: e.target.value })} /></div>
              <div><Label>Médico</Label><Input value={form.doctor_name || ''} onChange={(e) => setForm({ ...form, doctor_name: e.target.value })} /></div>
              <div><Label>CRM</Label><Input value={form.doctor_crm || ''} onChange={(e) => setForm({ ...form, doctor_crm: e.target.value })} /></div>
              <div><Label>URL do ASO</Label><Input value={form.file_url || ''} onChange={(e) => setForm({ ...form, file_url: e.target.value })} /></div>
              <div className="col-span-2"><Label>Observações</Label><Textarea value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={submit} disabled={!form.employee_id || !form.exam_date}>Salvar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
