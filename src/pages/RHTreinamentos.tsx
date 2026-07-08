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
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, Trash2, GraduationCap } from "lucide-react";
import {
  useTrainingsCatalog, useSaveTrainingCatalog, useDeleteTrainingCatalog,
  useEmployeeTrainings, useSaveEmployeeTraining, useDeleteEmployeeTraining,
} from "@/hooks/use-rh-extended";
import { useEmployees } from "@/hooks/use-rh";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

const fmtDate = (v: any) => { if (!v) return "—"; try { return format(parseISO(String(v).slice(0,10) + 'T12:00:00'), 'dd/MM/yyyy', { locale: ptBR }); } catch { return "—"; } };
const CAT_EMPTY: any = { name: '', code: '', category: '', description: '', workload_hours: 0, validity_months: 12, is_mandatory: false };
const REG_EMPTY: any = { employee_id: '', training_id: '', completion_date: new Date().toISOString().slice(0,10), expiry_date: '', score: '', instructor: '', certificate_url: '' };

export default function RHTreinamentos() {
  const [tab, setTab] = useState<'registros' | 'catalogo'>('registros');
  const [regTab, setRegTab] = useState<'todos' | 'vencendo' | 'vencido'>('todos');
  const [catOpen, setCatOpen] = useState(false);
  const [regOpen, setRegOpen] = useState(false);
  const [catForm, setCatForm] = useState<any>({ ...CAT_EMPTY });
  const [regForm, setRegForm] = useState<any>({ ...REG_EMPTY });

  const { data: catalog = [] } = useTrainingsCatalog();
  const { data: registros = [] } = useEmployeeTrainings(regTab === 'todos' ? undefined : { status: regTab });
  const { data: employees = [] } = useEmployees({ status: 'ativo' });
  const saveCat = useSaveTrainingCatalog(); const delCat = useDeleteTrainingCatalog();
  const saveReg = useSaveEmployeeTraining(); const delReg = useDeleteEmployeeTraining();

  return (
    <MainLayout>
      <div className="p-6 space-y-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><GraduationCap className="h-6 w-6" />Treinamentos</h1>
          <p className="text-sm text-muted-foreground">NRs, integração, reciclagens e certificações</p>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList>
            <TabsTrigger value="registros">Registros</TabsTrigger>
            <TabsTrigger value="catalogo">Catálogo</TabsTrigger>
          </TabsList>

          <TabsContent value="registros" className="mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <Tabs value={regTab} onValueChange={(v) => setRegTab(v as any)}>
                <TabsList>
                  <TabsTrigger value="todos">Todos</TabsTrigger>
                  <TabsTrigger value="vencendo">Vencendo (60d)</TabsTrigger>
                  <TabsTrigger value="vencido">Vencidos</TabsTrigger>
                </TabsList>
              </Tabs>
              <Button onClick={() => { setRegForm({ ...REG_EMPTY }); setRegOpen(true); }}><Plus className="h-4 w-4 mr-2" />Novo registro</Button>
            </div>
            <Card><CardContent className="p-0">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Colaborador</TableHead><TableHead>Treinamento</TableHead>
                  <TableHead>Conclusão</TableHead><TableHead>Vencimento</TableHead>
                  <TableHead>Nota</TableHead><TableHead>Instrutor</TableHead><TableHead className="text-right">Ações</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {registros.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhum registro.</TableCell></TableRow>
                  : registros.map((r: any) => {
                    const expired = r.expiry_date && new Date(r.expiry_date) < new Date();
                    return (
                      <TableRow key={r.id}>
                        <TableCell>{r.employee_name}</TableCell>
                        <TableCell>{r.training_name} {r.training_code && <span className="text-xs text-muted-foreground">({r.training_code})</span>}{r.is_mandatory && <Badge variant="destructive" className="ml-2 text-xs">Obrig.</Badge>}</TableCell>
                        <TableCell>{fmtDate(r.completion_date)}</TableCell>
                        <TableCell><Badge variant={expired ? 'destructive' : 'secondary'}>{fmtDate(r.expiry_date)}</Badge></TableCell>
                        <TableCell>{r.score || '—'}</TableCell>
                        <TableCell>{r.instructor || '—'}</TableCell>
                        <TableCell className="text-right"><Button size="icon" variant="ghost" onClick={() => confirm('Excluir?') && delReg.mutate(r.id)}><Trash2 className="h-4 w-4" /></Button></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="catalogo" className="mt-4 space-y-3">
            <div className="flex justify-end">
              <Button onClick={() => { setCatForm({ ...CAT_EMPTY }); setCatOpen(true); }}><Plus className="h-4 w-4 mr-2" />Novo treinamento</Button>
            </div>
            <Card><CardContent className="p-0">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Nome</TableHead><TableHead>Código</TableHead><TableHead>Categoria</TableHead>
                  <TableHead>CH</TableHead><TableHead>Validade</TableHead><TableHead>Obrig.</TableHead><TableHead className="text-right">Ações</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {catalog.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhum treinamento.</TableCell></TableRow>
                  : catalog.map((c: any) => (
                    <TableRow key={c.id}>
                      <TableCell>{c.name}</TableCell>
                      <TableCell>{c.code || '—'}</TableCell>
                      <TableCell>{c.category || '—'}</TableCell>
                      <TableCell>{c.workload_hours}h</TableCell>
                      <TableCell>{c.validity_months} meses</TableCell>
                      <TableCell>{c.is_mandatory ? <Badge variant="destructive">Sim</Badge> : '—'}</TableCell>
                      <TableCell className="text-right"><Button size="icon" variant="ghost" onClick={() => confirm('Excluir?') && delCat.mutate(c.id)}><Trash2 className="h-4 w-4" /></Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent></Card>
          </TabsContent>
        </Tabs>

        {/* Dialog catálogo */}
        <Dialog open={catOpen} onOpenChange={setCatOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>Novo treinamento</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><Label>Nome</Label><Input value={catForm.name} onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} /></div>
              <div><Label>Código</Label><Input value={catForm.code || ''} onChange={(e) => setCatForm({ ...catForm, code: e.target.value })} placeholder="Ex: NR-06" /></div>
              <div><Label>Categoria</Label><Input value={catForm.category || ''} onChange={(e) => setCatForm({ ...catForm, category: e.target.value })} /></div>
              <div><Label>Carga horária (h)</Label><Input type="number" value={catForm.workload_hours} onChange={(e) => setCatForm({ ...catForm, workload_hours: Number(e.target.value) })} /></div>
              <div><Label>Validade (meses)</Label><Input type="number" value={catForm.validity_months} onChange={(e) => setCatForm({ ...catForm, validity_months: Number(e.target.value) })} /></div>
              <div className="col-span-2 flex items-center gap-2"><Switch checked={catForm.is_mandatory} onCheckedChange={(v) => setCatForm({ ...catForm, is_mandatory: v })} /><Label>Obrigatório</Label></div>
              <div className="col-span-2"><Label>Descrição</Label><Textarea value={catForm.description || ''} onChange={(e) => setCatForm({ ...catForm, description: e.target.value })} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCatOpen(false)}>Cancelar</Button>
              <Button onClick={async () => { await saveCat.mutateAsync(catForm); setCatOpen(false); }} disabled={!catForm.name}>Salvar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog registro */}
        <Dialog open={regOpen} onOpenChange={setRegOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>Novo registro</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Colaborador</Label>
                <Select value={regForm.employee_id} onValueChange={(v) => setRegForm({ ...regForm, employee_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{employees.map((e: any) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label>Treinamento</Label>
                <Select value={regForm.training_id} onValueChange={(v) => setRegForm({ ...regForm, training_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{catalog.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Data de conclusão</Label><Input type="date" value={regForm.completion_date} onChange={(e) => setRegForm({ ...regForm, completion_date: e.target.value })} /></div>
              <div><Label>Vencimento</Label><Input type="date" value={regForm.expiry_date || ''} onChange={(e) => setRegForm({ ...regForm, expiry_date: e.target.value })} /></div>
              <div><Label>Nota</Label><Input type="number" step="0.1" value={regForm.score || ''} onChange={(e) => setRegForm({ ...regForm, score: e.target.value })} /></div>
              <div><Label>Instrutor</Label><Input value={regForm.instructor || ''} onChange={(e) => setRegForm({ ...regForm, instructor: e.target.value })} /></div>
              <div className="col-span-2"><Label>URL do certificado</Label><Input value={regForm.certificate_url || ''} onChange={(e) => setRegForm({ ...regForm, certificate_url: e.target.value })} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRegOpen(false)}>Cancelar</Button>
              <Button onClick={async () => { await saveReg.mutateAsync(regForm); setRegOpen(false); }} disabled={!regForm.employee_id || !regForm.training_id}>Salvar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
