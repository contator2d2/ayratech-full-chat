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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, Trash2, Pencil, Shield, PackageCheck } from "lucide-react";
import {
  useEpiCatalog, useSaveEpi, useDeleteEpi,
  useEpiDeliveries, useSaveEpiDelivery, useDeleteEpiDelivery,
} from "@/hooks/use-rh-extended";
import { useEmployees } from "@/hooks/use-rh";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

const fmtDate = (v: any) => { if (!v) return "—"; try { return format(parseISO(String(v).slice(0,10) + 'T12:00:00'), 'dd/MM/yyyy', { locale: ptBR }); } catch { return "—"; } };
const EPI_EMPTY: any = { name: '', ca_number: '', ca_expiry: '', category: '', description: '', photo_url: '', stock_qty: 0, min_stock: 0, default_lifetime_days: 180, active: true };
const DEL_EMPTY: any = { employee_id: '', epi_id: '', quantity: 1, delivery_type: 'entrega', delivery_date: new Date().toISOString().slice(0,10), expected_replacement: '', signed_receipt_url: '', notes: '' };

export default function RHEPIs() {
  const [subtab, setSubtab] = useState<'catalogo' | 'entregas'>('entregas');
  const [delTab, setDelTab] = useState<'todos' | 'vencendo' | 'vencido'>('todos');
  const [epiOpen, setEpiOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [epiForm, setEpiForm] = useState<any>({ ...EPI_EMPTY });
  const [delForm, setDelForm] = useState<any>({ ...DEL_EMPTY });

  const { data: catalog = [] } = useEpiCatalog();
  const { data: deliveries = [] } = useEpiDeliveries(delTab === 'todos' ? undefined : { status: delTab });
  const { data: employees = [] } = useEmployees({ status: 'ativo' });

  const saveEpi = useSaveEpi(); const delEpi = useDeleteEpi();
  const saveDel = useSaveEpiDelivery(); const delDel = useDeleteEpiDelivery();

  const submitEpi = async () => { await saveEpi.mutateAsync(epiForm); setEpiOpen(false); };
  const submitDel = async () => { await saveDel.mutateAsync(delForm); setDelOpen(false); };

  return (
    <MainLayout>
      <div className="p-6 space-y-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Shield className="h-6 w-6" />EPIs</h1>
          <p className="text-sm text-muted-foreground">Catálogo, entregas, trocas e devoluções</p>
        </div>

        <Tabs value={subtab} onValueChange={(v) => setSubtab(v as any)}>
          <TabsList>
            <TabsTrigger value="entregas">Entregas / Trocas</TabsTrigger>
            <TabsTrigger value="catalogo">Catálogo</TabsTrigger>
          </TabsList>

          <TabsContent value="entregas" className="mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <Tabs value={delTab} onValueChange={(v) => setDelTab(v as any)}>
                <TabsList>
                  <TabsTrigger value="todos">Todas</TabsTrigger>
                  <TabsTrigger value="vencendo">Vencendo (30d)</TabsTrigger>
                  <TabsTrigger value="vencido">Vencidas</TabsTrigger>
                </TabsList>
              </Tabs>
              <Button onClick={() => { setDelForm({ ...DEL_EMPTY }); setDelOpen(true); }}><Plus className="h-4 w-4 mr-2" />Nova entrega</Button>
            </div>
            <Card><CardContent className="p-0">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Colaborador</TableHead><TableHead>EPI</TableHead><TableHead>CA</TableHead>
                  <TableHead>Tipo</TableHead><TableHead>Qtd</TableHead><TableHead>Entrega</TableHead>
                  <TableHead>Prev. troca</TableHead><TableHead>Devolvido</TableHead><TableHead className="text-right">Ações</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {deliveries.length === 0 ? <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">Nenhum.</TableCell></TableRow>
                  : deliveries.map((r: any) => {
                    const expired = r.expected_replacement && !r.returned_at && new Date(r.expected_replacement) < new Date();
                    return (
                      <TableRow key={r.id}>
                        <TableCell>{r.employee_name}</TableCell>
                        <TableCell>{r.epi_name}</TableCell>
                        <TableCell>{r.ca_number || '—'}</TableCell>
                        <TableCell className="capitalize">{r.delivery_type}</TableCell>
                        <TableCell>{r.quantity}</TableCell>
                        <TableCell>{fmtDate(r.delivery_date)}</TableCell>
                        <TableCell><Badge variant={expired ? 'destructive' : 'secondary'}>{fmtDate(r.expected_replacement)}</Badge></TableCell>
                        <TableCell>{fmtDate(r.returned_at)}</TableCell>
                        <TableCell className="text-right">
                          <Button size="icon" variant="ghost" onClick={() => confirm('Excluir?') && delDel.mutate(r.id)}><Trash2 className="h-4 w-4" /></Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="catalogo" className="mt-4 space-y-3">
            <div className="flex items-center justify-end">
              <Button onClick={() => { setEpiForm({ ...EPI_EMPTY }); setEpiOpen(true); }}><Plus className="h-4 w-4 mr-2" />Novo EPI</Button>
            </div>
            <Card><CardContent className="p-0">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Nome</TableHead><TableHead>Categoria</TableHead><TableHead>CA</TableHead>
                  <TableHead>Val. CA</TableHead><TableHead>Estoque</TableHead><TableHead>Vida útil</TableHead><TableHead className="text-right">Ações</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {catalog.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhum EPI cadastrado.</TableCell></TableRow>
                  : catalog.map((c: any) => {
                    const caExpired = c.ca_expiry && new Date(c.ca_expiry) < new Date();
                    const low = c.stock_qty <= c.min_stock;
                    return (
                      <TableRow key={c.id}>
                        <TableCell><PackageCheck className="h-4 w-4 inline mr-2" />{c.name}</TableCell>
                        <TableCell>{c.category || '—'}</TableCell>
                        <TableCell>{c.ca_number || '—'}</TableCell>
                        <TableCell><Badge variant={caExpired ? 'destructive' : 'secondary'}>{fmtDate(c.ca_expiry)}</Badge></TableCell>
                        <TableCell><Badge variant={low ? 'destructive' : 'outline'}>{c.stock_qty} (min {c.min_stock})</Badge></TableCell>
                        <TableCell>{c.default_lifetime_days}d</TableCell>
                        <TableCell className="text-right">
                          <Button size="icon" variant="ghost" onClick={() => { setEpiForm({ ...c, ca_expiry: c.ca_expiry?.slice(0,10) || '' }); setEpiOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" onClick={() => confirm('Excluir?') && delEpi.mutate(c.id)}><Trash2 className="h-4 w-4" /></Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent></Card>
          </TabsContent>
        </Tabs>

        {/* Dialog EPI catalog */}
        <Dialog open={epiOpen} onOpenChange={setEpiOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>{epiForm.id ? 'Editar EPI' : 'Novo EPI'}</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><Label>Nome</Label><Input value={epiForm.name} onChange={(e) => setEpiForm({ ...epiForm, name: e.target.value })} /></div>
              <div><Label>Categoria</Label><Input value={epiForm.category || ''} onChange={(e) => setEpiForm({ ...epiForm, category: e.target.value })} /></div>
              <div><Label>CA</Label><Input value={epiForm.ca_number || ''} onChange={(e) => setEpiForm({ ...epiForm, ca_number: e.target.value })} /></div>
              <div><Label>Validade CA</Label><Input type="date" value={epiForm.ca_expiry || ''} onChange={(e) => setEpiForm({ ...epiForm, ca_expiry: e.target.value })} /></div>
              <div><Label>Vida útil (dias)</Label><Input type="number" value={epiForm.default_lifetime_days} onChange={(e) => setEpiForm({ ...epiForm, default_lifetime_days: Number(e.target.value) })} /></div>
              <div><Label>Estoque</Label><Input type="number" value={epiForm.stock_qty} onChange={(e) => setEpiForm({ ...epiForm, stock_qty: Number(e.target.value) })} /></div>
              <div><Label>Estoque mínimo</Label><Input type="number" value={epiForm.min_stock} onChange={(e) => setEpiForm({ ...epiForm, min_stock: Number(e.target.value) })} /></div>
              <div className="col-span-2"><Label>Descrição</Label><Textarea value={epiForm.description || ''} onChange={(e) => setEpiForm({ ...epiForm, description: e.target.value })} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEpiOpen(false)}>Cancelar</Button>
              <Button onClick={submitEpi} disabled={!epiForm.name}>Salvar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog Delivery */}
        <Dialog open={delOpen} onOpenChange={setDelOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>Nova entrega</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Colaborador</Label>
                <Select value={delForm.employee_id} onValueChange={(v) => setDelForm({ ...delForm, employee_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{employees.map((e: any) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label>EPI</Label>
                <Select value={delForm.epi_id} onValueChange={(v) => setDelForm({ ...delForm, epi_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{catalog.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name} {c.ca_number ? `— CA ${c.ca_number}` : ''}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Tipo</Label>
                <Select value={delForm.delivery_type} onValueChange={(v) => setDelForm({ ...delForm, delivery_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="entrega">Entrega</SelectItem>
                    <SelectItem value="troca">Troca</SelectItem>
                    <SelectItem value="devolucao">Devolução</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Quantidade</Label><Input type="number" value={delForm.quantity} onChange={(e) => setDelForm({ ...delForm, quantity: Number(e.target.value) })} /></div>
              <div><Label>Data</Label><Input type="date" value={delForm.delivery_date} onChange={(e) => setDelForm({ ...delForm, delivery_date: e.target.value })} /></div>
              <div><Label>Prev. próxima troca</Label><Input type="date" value={delForm.expected_replacement || ''} onChange={(e) => setDelForm({ ...delForm, expected_replacement: e.target.value })} /></div>
              <div className="col-span-2"><Label>URL do termo assinado</Label><Input value={delForm.signed_receipt_url || ''} onChange={(e) => setDelForm({ ...delForm, signed_receipt_url: e.target.value })} /></div>
              <div className="col-span-2"><Label>Observações</Label><Textarea value={delForm.notes || ''} onChange={(e) => setDelForm({ ...delForm, notes: e.target.value })} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDelOpen(false)}>Cancelar</Button>
              <Button onClick={submitDel} disabled={!delForm.employee_id || !delForm.epi_id}>Salvar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
