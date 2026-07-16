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
import { Plus, Trash2, Pencil, Users, Calendar } from "lucide-react";
import {
  useSchedules, useSaveSchedule, useDeleteSchedule,
  useScheduleAssignments, useAssignSchedule, useRemoveAssignment,
} from "@/hooks/use-rh-schedules";
import { useEmployees } from "@/hooks/use-rh";
import { toast } from "sonner";

const DAYS = [
  { v: 0, l: 'Dom' }, { v: 1, l: 'Seg' }, { v: 2, l: 'Ter' },
  { v: 3, l: 'Qua' }, { v: 4, l: 'Qui' }, { v: 5, l: 'Sex' }, { v: 6, l: 'Sáb' },
];

const TYPE_PRESETS: Record<string, any> = {
  '5x2':    { weekly_hours: 44, daily_hours: 8.8, workdays: [1,2,3,4,5], dsr_day: 0, entry_time: '08:00', exit_time: '17:48', break_start: '12:00', break_end: '13:00' },
  '6x1':    { weekly_hours: 44, daily_hours: 7.33, workdays: [1,2,3,4,5,6], dsr_day: 0, entry_time: '08:00', exit_time: '15:20', break_start: '12:00', break_end: '13:00' },
  '12x36':  { weekly_hours: 36, daily_hours: 12, workdays: [1,3,5], dsr_day: 0, entry_time: '07:00', exit_time: '19:00', break_start: '12:00', break_end: '13:00' },
  '4x2':    { weekly_hours: 44, daily_hours: 11, workdays: [1,2,3,4], dsr_day: 0, entry_time: '07:00', exit_time: '18:00', break_start: '12:00', break_end: '13:00' },
  'livre':  { weekly_hours: 44, daily_hours: 8.8, workdays: [1,2,3,4,5], dsr_day: 0, entry_time: '00:00', exit_time: '00:00', break_start: '00:00', break_end: '00:00' },
};

const EMPTY: any = { name: '', schedule_type: '5x2', ...TYPE_PRESETS['5x2'], tolerance_minutes: 10, break_minutes: 60, night_shift: false, active: true, notes: '' };

export default function RHEscalas() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ ...EMPTY });
  const [assignOpen, setAssignOpen] = useState<any>(null);
  const [assignEmp, setAssignEmp] = useState<string>('');

  const { data: schedules = [] } = useSchedules();
  const { data: employees = [] } = useEmployees({ status: 'ativo' });
  const save = useSaveSchedule();
  const del = useDeleteSchedule();

  const openNew = () => { setForm({ ...EMPTY }); setOpen(true); };
  const openEdit = (s: any) => {
    setForm({
      ...s,
      workdays: s.workdays || [1,2,3,4,5],
      entry_time: (s.entry_time || '08:00').slice(0,5),
      exit_time: (s.exit_time || '17:48').slice(0,5),
      break_start: (s.break_start || '12:00').slice(0,5),
      break_end: (s.break_end || '13:00').slice(0,5),
    });
    setOpen(true);
  };

  const changeType = (t: string) => {
    setForm((f: any) => ({ ...f, schedule_type: t, ...(TYPE_PRESETS[t] || {}) }));
  };

  const toggleDay = (d: number) => {
    setForm((f: any) => {
      const wd: number[] = f.workdays || [];
      return { ...f, workdays: wd.includes(d) ? wd.filter(x => x !== d) : [...wd, d].sort() };
    });
  };

  const submit = () => {
    if (!form.name) { toast.error('Nome obrigatório'); return; }
    save.mutate(form, { onSuccess: () => { toast.success('Escala salva'); setOpen(false); } });
  };

  return (
    <MainLayout>
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Escalas de Trabalho</h1>
            <p className="text-sm text-muted-foreground">5x2, 6x1, 12x36 e escalas personalizadas com DSR e tolerância</p>
          </div>
          <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Nova Escala</Button>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Jornada</TableHead>
                  <TableHead>Dias</TableHead>
                  <TableHead>Horário</TableHead>
                  <TableHead>Colaboradores</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schedules.map((s: any) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell><Badge variant="outline">{s.schedule_type}</Badge></TableCell>
                    <TableCell>{s.weekly_hours}h/sem</TableCell>
                    <TableCell className="text-xs">
                      {(s.workdays || []).map((d: number) => DAYS[d]?.l).join(', ')}
                    </TableCell>
                    <TableCell className="text-xs">{s.pattern?.per_day ? <Badge variant="outline">Personalizado por dia</Badge> : `${(s.entry_time || '').slice(0,5)} - ${(s.exit_time || '').slice(0,5)}`}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => setAssignOpen(s)}>
                        <Users className="h-3 w-3 mr-1" /> {s.assigned_count || 0}
                      </Button>
                    </TableCell>
                    <TableCell>{s.active ? <Badge>Ativa</Badge> : <Badge variant="secondary">Inativa</Badge>}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(s)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => { if (confirm('Excluir escala?')) del.mutate(s.id); }}><Trash2 className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!schedules.length && <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Nenhuma escala cadastrada</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Escala editor */}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0">
            <DialogHeader className="px-6 pt-6"><DialogTitle>{form.id ? 'Editar' : 'Nova'} Escala</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3 overflow-y-auto px-6 py-2 flex-1">
              <div className="col-span-2">
                <Label>Nome *</Label>
                <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ex: Comercial 5x2" />
              </div>
              <div>
                <Label>Tipo</Label>
                <Select value={form.schedule_type} onValueChange={changeType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5x2">5x2 (Seg-Sex)</SelectItem>
                    <SelectItem value="6x1">6x1 (Seg-Sab)</SelectItem>
                    <SelectItem value="12x36">12x36</SelectItem>
                    <SelectItem value="4x2">4x2</SelectItem>
                    <SelectItem value="livre">Jornada Livre</SelectItem>
                    <SelectItem value="personalizado">Personalizado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Horas semanais</Label>
                <Input type="number" step="0.5" value={form.weekly_hours} onChange={e => setForm({ ...form, weekly_hours: parseFloat(e.target.value) })} />
              </div>
              <div>
                <Label>Entrada</Label>
                <Input type="time" value={form.entry_time} onChange={e => setForm({ ...form, entry_time: e.target.value })} />
              </div>
              <div>
                <Label>Saída</Label>
                <Input type="time" value={form.exit_time} onChange={e => setForm({ ...form, exit_time: e.target.value })} />
              </div>
              <div>
                <Label>Início intervalo</Label>
                <Input type="time" value={form.break_start} onChange={e => setForm({ ...form, break_start: e.target.value })} />
              </div>
              <div>
                <Label>Fim intervalo</Label>
                <Input type="time" value={form.break_end} onChange={e => setForm({ ...form, break_end: e.target.value })} />
              </div>
              <div>
                <Label>Tolerância (min)</Label>
                <Input type="number" value={form.tolerance_minutes} onChange={e => setForm({ ...form, tolerance_minutes: parseInt(e.target.value) })} />
              </div>
              <div>
                <Label>DSR (dia)</Label>
                <Select value={String(form.dsr_day ?? 0)} onValueChange={v => setForm({ ...form, dsr_day: parseInt(v) })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{DAYS.map(d => <SelectItem key={d.v} value={String(d.v)}>{d.l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label>Dias de trabalho</Label>
                <div className="flex gap-2 flex-wrap mt-1">
                  {DAYS.map(d => (
                    <Button key={d.v} type="button" size="sm"
                      variant={(form.workdays || []).includes(d.v) ? 'default' : 'outline'}
                      onClick={() => toggleDay(d.v)}>{d.l}</Button>
                  ))}
                </div>
              </div>

              <div className="col-span-2 border-t pt-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Horários diferentes por dia</Label>
                    <p className="text-xs text-muted-foreground">Ex: Seg-Sex 08:00-18:00, Sáb 08:00-12:00</p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant={form.pattern?.per_day ? 'default' : 'outline'}
                    onClick={() => {
                      const enabled = !form.pattern?.per_day;
                      const days: Record<string, any> = { ...(form.pattern?.days || {}) };
                      if (enabled) {
                        (form.workdays || []).forEach((d: number) => {
                          if (!days[d]) days[d] = {
                            entry: form.entry_time || '08:00',
                            exit: form.exit_time || '18:00',
                            break_start: form.break_start || '12:00',
                            break_end: form.break_end || '13:00',
                          };
                        });
                      }
                      setForm({ ...form, pattern: { ...(form.pattern || {}), per_day: enabled, days } });
                    }}
                  >
                    {form.pattern?.per_day ? 'Ativado' : 'Ativar'}
                  </Button>
                </div>
                {form.pattern?.per_day && (
                  <div className="mt-3 space-y-2">
                    {DAYS.filter(d => (form.workdays || []).includes(d.v)).map(d => {
                      const day = form.pattern?.days?.[d.v] || { entry: '08:00', exit: '18:00', break_start: '12:00', break_end: '13:00' };
                      const setDay = (patch: any) => {
                        const days = { ...(form.pattern?.days || {}), [d.v]: { ...day, ...patch } };
                        setForm({ ...form, pattern: { ...form.pattern, days } });
                      };
                      return (
                        <div key={d.v} className="grid grid-cols-5 gap-2 items-center bg-muted/40 rounded p-2">
                          <div className="text-sm font-medium">{d.l}</div>
                          <div>
                            <Label className="text-[10px]">Entrada</Label>
                            <Input type="time" value={day.entry} onChange={e => setDay({ entry: e.target.value })} />
                          </div>
                          <div>
                            <Label className="text-[10px]">Saída</Label>
                            <Input type="time" value={day.exit} onChange={e => setDay({ exit: e.target.value })} />
                          </div>
                          <div>
                            <Label className="text-[10px]">Ini. Intervalo</Label>
                            <Input type="time" value={day.break_start || ''} onChange={e => setDay({ break_start: e.target.value })} />
                          </div>
                          <div>
                            <Label className="text-[10px]">Fim Intervalo</Label>
                            <Input type="time" value={day.break_end || ''} onChange={e => setDay({ break_end: e.target.value })} />
                          </div>
                        </div>
                      );
                    })}
                    <p className="text-xs text-muted-foreground">Os campos "Entrada/Saída" acima passam a servir apenas como padrão para dias sem configuração específica.</p>
                  </div>
                )}
              </div>

              <div className="col-span-2">
                <Label>Observações</Label>
                <Textarea value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
            <DialogFooter className="px-6 pb-6 pt-3 border-t">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={submit} disabled={save.isPending}>Salvar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Assignments */}
        <Dialog open={!!assignOpen} onOpenChange={() => setAssignOpen(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>Colaboradores — {assignOpen?.name}</DialogTitle></DialogHeader>
            {assignOpen && <AssignmentPanel schedule={assignOpen} employees={employees} />}
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}

function AssignmentPanel({ schedule, employees }: any) {
  const [empId, setEmpId] = useState('');
  const { data: assignments = [] } = useScheduleAssignments(schedule.id);
  const assign = useAssignSchedule();
  const remove = useRemoveAssignment();

  const addOne = () => {
    if (!empId) return;
    assign.mutate({ employee_id: empId, schedule_id: schedule.id },
      { onSuccess: () => { toast.success('Colaborador atribuído'); setEmpId(''); } });
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Select value={empId} onValueChange={setEmpId}>
          <SelectTrigger><SelectValue placeholder="Selecionar colaborador..." /></SelectTrigger>
          <SelectContent>
            {employees.map((e: any) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button onClick={addOne} disabled={!empId || assign.isPending}>Atribuir</Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow><TableHead>Nome</TableHead><TableHead>Desde</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow>
        </TableHeader>
        <TableBody>
          {assignments.map((a: any) => (
            <TableRow key={a.id}>
              <TableCell>{a.full_name}</TableCell>
              <TableCell className="text-xs">{a.start_date}</TableCell>
              <TableCell>{a.active ? <Badge>Ativa</Badge> : <Badge variant="secondary">Encerrada</Badge>}</TableCell>
              <TableCell className="text-right">
                {a.active && <Button variant="ghost" size="icon" onClick={() => remove.mutate(a.id)}><Trash2 className="h-4 w-4" /></Button>}
              </TableCell>
            </TableRow>
          ))}
          {!assignments.length && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-4">Nenhum colaborador</TableCell></TableRow>}
        </TableBody>
      </Table>
    </div>
  );
}
