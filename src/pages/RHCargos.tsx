import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Briefcase, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useRhPositions, useCreateRhPosition, useDeleteRhPosition, useRhDepartments } from "@/hooks/use-rh";

export default function RHCargos() {
  const { data: positions = [], isLoading } = useRhPositions();
  const { data: departments = [] } = useRhDepartments();
  const createPos = useCreateRhPosition();
  const deletePos = useDeleteRhPosition();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", department_id: "", description: "" });

  const save = async () => {
    if (!form.name.trim()) return toast.error("Informe o nome do cargo");
    try {
      await createPos.mutateAsync({
        name: form.name.trim(),
        department_id: form.department_id || null,
        description: form.description || null,
      });
      toast.success("Cargo cadastrado");
      setOpen(false);
      setForm({ name: "", department_id: "", description: "" });
    } catch (e: any) {
      toast.error(e?.message || "Erro ao cadastrar cargo");
    }
  };

  const remove = async (id: string, name: string) => {
    if (!confirm(`Excluir o cargo "${name}"?`)) return;
    try {
      await deletePos.mutateAsync(id);
      toast.success("Cargo excluído");
    } catch (e: any) {
      toast.error(e?.message || "Erro ao excluir");
    }
  };

  return (
    <MainLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Briefcase className="h-6 w-6" /> Cargos
            </h1>
            <p className="text-sm text-muted-foreground">Cadastre os cargos utilizados no RH, no wizard de admissão e nos colaboradores.</p>
          </div>
          <Button onClick={() => setOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" /> Novo Cargo
          </Button>
        </div>

        <Card className="p-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Carregando...</p>
          ) : positions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Nenhum cargo cadastrado. Clique em "Novo Cargo" para começar.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead className="hidden md:table-cell">Departamento</TableHead>
                  <TableHead className="hidden md:table-cell">Descrição</TableHead>
                  <TableHead className="w-20 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {positions.map((p: any) => {
                  const dept = departments.find((d: any) => d.id === p.department_id);
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{dept?.name || "—"}</TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground max-w-md truncate">{p.description || "—"}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => remove(p.id, p.name)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Cargo</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex.: Promotor de Vendas" />
            </div>
            <div>
              <Label>Departamento</Label>
              <Select value={form.department_id || "none"} onValueChange={v => setForm(f => ({ ...f, department_id: v === "none" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione (opcional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Sem departamento —</SelectItem>
                  {departments.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} placeholder="Descrição / responsabilidades (opcional)" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={createPos.isPending}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
