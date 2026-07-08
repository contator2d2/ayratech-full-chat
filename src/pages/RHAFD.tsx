import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Download, Copy, Monitor, ExternalLink } from "lucide-react";
import { useTotemDevices, useCreateTotemDevice, useDeleteTotemDevice } from "@/hooks/use-rh-schedules";
import { toast } from "sonner";
import { API_URL, getAuthToken } from "@/lib/api";

export default function RHAFD() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ name: '', require_face: true, require_geo: false });
  const [range, setRange] = useState({
    start: new Date(Date.now() - 30*86400000).toISOString().slice(0,10),
    end: new Date().toISOString().slice(0,10),
  });

  const { data: devices = [] } = useTotemDevices();
  const create = useCreateTotemDevice();
  const del = useDeleteTotemDevice();

  const submit = () => {
    if (!form.name) { toast.error('Nome obrigatório'); return; }
    create.mutate(form, { onSuccess: () => { toast.success('Totem criado'); setOpen(false); setForm({ name: '', require_face: true, require_geo: false }); } });
  };

  const copyLink = (token: string) => {
    const url = `${window.location.origin}/rh/totem?token=${token}`;
    navigator.clipboard.writeText(url);
    toast.success('Link copiado');
  };

  const downloadAFD = async () => {
    const token = getAuthToken();
    const base = API_URL || '';
    try {
      const res = await fetch(`${base}/api/rh/afd/export?start=${range.start}&end=${range.end}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `AFD_${range.start}_${range.end}.txt`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast.success('AFD exportado');
    } catch (err: any) {
      toast.error('Erro ao exportar: ' + err.message);
    }
  };

  return (
    <MainLayout>
      <div className="p-6 space-y-4">
        <div>
          <h1 className="text-2xl font-bold">Totem de Ponto & Exportação AFD</h1>
          <p className="text-sm text-muted-foreground">Gerencie dispositivos de ponto e exporte AFD (Portaria MTE 671/2021)</p>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2"><Download className="h-4 w-4" /> Exportar AFD</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-3 flex-wrap">
              <div>
                <Label>Início</Label>
                <Input type="date" value={range.start} onChange={e => setRange({ ...range, start: e.target.value })} />
              </div>
              <div>
                <Label>Fim</Label>
                <Input type="date" value={range.end} onChange={e => setRange({ ...range, end: e.target.value })} />
              </div>
              <Button onClick={downloadAFD}><Download className="h-4 w-4 mr-1" /> Baixar AFD</Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">Formato NSR|Tipo|Conteúdo conforme layout REP-P (Portaria 671/2021).</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2"><Monitor className="h-4 w-4" /> Dispositivos de Totem</CardTitle>
            <Button onClick={() => setOpen(true)} size="sm"><Plus className="h-4 w-4 mr-1" /> Novo Totem</Button>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Face</TableHead>
                  <TableHead>GPS</TableHead>
                  <TableHead>Último uso</TableHead>
                  <TableHead>Token</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {devices.map((d: any) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">{d.name}</TableCell>
                    <TableCell>{d.require_face ? <Badge>Sim</Badge> : <Badge variant="secondary">Não</Badge>}</TableCell>
                    <TableCell>{d.require_geo ? <Badge>Sim</Badge> : <Badge variant="secondary">Não</Badge>}</TableCell>
                    <TableCell className="text-xs">{d.last_seen_at ? new Date(d.last_seen_at).toLocaleString('pt-BR') : '—'}</TableCell>
                    <TableCell className="font-mono text-xs">{d.device_token.slice(0,12)}...</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => copyLink(d.device_token)} title="Copiar link"><Copy className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => window.open(`/rh/totem?token=${d.device_token}`, '_blank')} title="Abrir totem"><ExternalLink className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => { if (confirm('Excluir totem?')) del.mutate(d.id); }}><Trash2 className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!devices.length && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhum totem cadastrado</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo Totem</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Nome *</Label>
                <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ex: Recepção Matriz" />
              </div>
              <div className="flex gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.require_face} onChange={e => setForm({ ...form, require_face: e.target.checked })} />
                  Exigir reconhecimento facial
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.require_geo} onChange={e => setForm({ ...form, require_geo: e.target.checked })} />
                  Exigir GPS
                </label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={submit} disabled={create.isPending}>Criar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
