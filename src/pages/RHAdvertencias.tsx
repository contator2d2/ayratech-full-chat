import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, AlertTriangle, CheckCircle } from "lucide-react";
import { useWarnings, useCreateWarning, useAcknowledgeWarning, useDeleteWarning } from "@/hooks/use-rh-extended";
import { useEmployees } from "@/hooks/use-rh";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

const TYPES = [
  { v: 'verbal', l: 'Advertência verbal' },
  { v: 'escrita', l: 'Advertência escrita' },
  { v: 'suspensao', l: 'Suspensão' },
  { v: 'justa_causa', l: 'Justa causa' },
];
const EMPTY: any = { employee_id: '', warning_type: 'escrita', warning_date: new Date().toISOString().slice(0,10), reason: '', description: '', witnesses: '', suspension_days: 0, file_url: '' };
const fmtDate = (v: any) => { if (!v) return "—"; try { return format(parseISO(String(v).slice(0,10) + 'T12:00:00'), 'dd/MM/yyyy', { locale: ptBR }); } catch { return "—"; } };

export default function RHAdvertencias() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ ...EMPTY });
  const { data: warnings = [] } = useWarnings();
  const { data: employees = [] } = useEmployees({ status: 'ativo' });
  const create = useCreateWarning();
  const ack = useAcknowledgeWarning();
  const del = useDeleteWarning();

  const submit = async () => { await create.mutateAsync(form); setOpen(false); setForm({ ...EMPTY }); };

  return (
    <MainLayout>
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><AlertTriangle className="h-6 w-6" />Advertências</h1>
            <p className="text-sm text-muted-foreground">Medidas disciplinares — verbais, escritas, suspensões</p>
          </div>
          <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-2" />Nova advertência</Button>
        </div>

        <Card><CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Colaborador</TableHead><TableHead>Tipo</TableHead><TableHead>Data</TableHead>
              <TableHead>Motivo</TableHead><TableHead>Susp.</TableHead><TableHead>Ciência</TableHead><TableHead className="text-right">Ações</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {warnings.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhuma advertência.</TableCell></TableRow>
              : warnings.map((w: any) => (
                <TableRow key={w.id}>
                  <TableCell>{w.employee_name}<div className="text-xs text-muted-foreground">{w.position}</div></TableCell>
                  <TableCell><Badge variant={w.warning_type === 'justa_causa' ? 'destructive' : w.warning_type === 'suspensao' ? 'secondary' : 'outline'}>{w.warning_type}</Badge></TableCell>
                  <TableCell>{fmtDate(w.warning_date)}</TableCell>
                  <TableCell className="max-w-xs truncate">{w.reason}</TableCell>
                  <TableCell>{w.suspension_days || '—'}</TableCell>
                  <TableCell>
                    {w.acknowledged
                      ? <Badge variant="outline"><CheckCircle className="h-3 w-3 mr-1" />Ciente</Badge>
                      : <Button size="sm" variant="ghost" onClick={() => ack.mutate(w.id)}>Marcar ciência</Button>}
                  </TableCell>
                  <TableCell className="text-right"><Button size="icon" variant="ghost" onClick={() => confirm('Excluir?') && del.mutate(w.id)}><Trash2 className="h-4 w-4" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent></Card>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>Nova advertência</DialogTitle></DialogHeader>
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
                <Select value={form.warning_type} onValueChange={(v) => setForm({ ...form, warning_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TYPES.map(t => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Data</Label><Input type="date" value={form.warning_date} onChange={(e) => setForm({ ...form, warning_date: e.target.value })} /></div>
              {form.warning_type === 'suspensao' && (
                <div><Label>Dias de suspensão</Label><Input type="number" value={form.suspension_days} onChange={(e) => setForm({ ...form, suspension_days: Number(e.target.value) })} /></div>
              )}
              <div className="col-span-2"><Label>Motivo</Label><Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div>
              <div className="col-span-2"><Label>Descrição</Label><Textarea value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
              <div className="col-span-2"><Label>Testemunhas</Label><Input value={form.witnesses || ''} onChange={(e) => setForm({ ...form, witnesses: e.target.value })} /></div>
              <div className="col-span-2"><Label>URL do documento</Label><Input value={form.file_url || ''} onChange={(e) => setForm({ ...form, file_url: e.target.value })} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={submit} disabled={!form.employee_id || !form.reason}>Salvar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
