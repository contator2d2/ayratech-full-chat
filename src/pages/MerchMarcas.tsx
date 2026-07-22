import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useBrands, useCreateBrand, useUpdateBrand, useDeleteBrand, useBrandPdvs, useAddPdvBrand, useRemovePdvBrand, useNetworks, useAddPdvBrandByNetwork } from "@/hooks/use-merchandising";
import { usePDVs } from "@/hooks/use-promotor";
import { FileUploadInput } from "@/components/ui/file-upload-input";
import { BrandImportDialog } from "@/components/merchandising/BrandImportDialog";
import { BrandPdvLinkImportDialog } from "@/components/merchandising/BrandPdvLinkImportDialog";
import { Plus, Search, Pencil, Trash2, Building2, Store, ArrowRight, ArrowLeft, Upload, Download, Link2, LayoutDashboard } from "lucide-react";
import { getAuthToken } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const emptyBrand = { 
  name: '', 
  internal_code: '',
  razao_social: '', 
  cnpj: '', 
  logo_url: '', 
  description: '', 
  segment: '', 
  responsible: '', 
  phone: '', 
  email: '', 
  street: '',
  number: '',
  neighborhood: '',
  city: '',
  zip: '',
  status: 'active', 
  notes: '' 
};

export default function MerchMarcas() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<any>(emptyBrand);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pdvDialogBrand, setPdvDialogBrand] = useState<any>(null);
  const [pdvSearch, setPdvSearch] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [linkImportOpen, setLinkImportOpen] = useState(false);

  const { user } = useAuth();
  const isAdmin = user?.role === 'owner' || user?.role === 'admin';
  const [exporting, setExporting] = useState(false);

  const { data: brands = [], isLoading } = useBrands({ search, status: statusFilter });
  const createBrand = useCreateBrand();
  const updateBrand = useUpdateBrand();
  const deleteBrand = useDeleteBrand();

  const { data: allPdvs = [] } = usePDVs();
  const { data: brandPdvs = [] } = useBrandPdvs(pdvDialogBrand?.id);
  const { data: networks = [] } = useNetworks();
  const addPdvBrand = useAddPdvBrand();
  const removePdvBrand = useRemovePdvBrand();
  const addPdvBrandByNetwork = useAddPdvBrandByNetwork();
  const [selectedNetwork, setSelectedNetwork] = useState<string>('');

  const linkedPdvIds = new Set(brandPdvs.map((bp: any) => bp.pdv_id));
  const filteredAvailable = useMemo(() =>
    allPdvs.filter((p: any) => !linkedPdvIds.has(p.id) && p.name?.toLowerCase().includes(pdvSearch.toLowerCase())),
    [allPdvs, linkedPdvIds, pdvSearch]
  );
  const filteredLinked = useMemo(() =>
    brandPdvs.filter((bp: any) => bp.pdv_name?.toLowerCase().includes(pdvSearch.toLowerCase())),
    [brandPdvs, pdvSearch]
  );

  const openNew = () => { setForm({ ...emptyBrand }); setEditingId(null); setDialogOpen(true); };
  const openEdit = (b: any) => { setForm({ ...b }); setEditingId(b.id); setDialogOpen(true); };

  const handleSave = async () => {
    if (!form.name) { toast.error('Nome é obrigatório'); return; }
    try {
      if (editingId) {
        await updateBrand.mutateAsync({ id: editingId, ...form });
        toast.success('Marca atualizada');
      } else {
        await createBrand.mutateAsync(form);
        toast.success('Marca criada');
      }
      setDialogOpen(false);
    } catch (e: any) { toast.error(e.message); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir marca?')) return;
    try { await deleteBrand.mutateAsync(id); toast.success('Excluída'); } catch (e: any) { toast.error(e.message); }
  };

  const handleBulkDelete = async () => {
    if (!selectedIds.size) return;
    if (!confirm(`Excluir ${selectedIds.size} marca(s) selecionada(s)?`)) return;
    let ok = 0, fail = 0;
    for (const id of selectedIds) {
      try { await deleteBrand.mutateAsync(id); ok++; } catch { fail++; }
    }
    setSelectedIds(new Set());
    toast.success(`${ok} excluída(s)${fail ? `, ${fail} erro(s)` : ''}`);
  };

  const toggleAll = () => {
    if (selectedIds.size === brands.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(brands.map((b: any) => b.id)));
  };
  const toggleOne = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };

  const set = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));

  const handleExport = async () => {
    try {
      setExporting(true);
      const token = getAuthToken();
      const params = new URLSearchParams();
      if (statusFilter && statusFilter !== 'all') params.set('status', statusFilter);
      if (search) params.set('search', search);
      const qs = params.toString();
      
      const res = await fetch(`/api/merchandising/brands/export${qs ? `?${qs}` : ''}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Erro ao exportar marcas');
      }
      
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `marcas_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Exportação concluída');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setExporting(false);
    }
  };

  const handleLinkPdv = async (pdvId: string) => {
    try {
      await addPdvBrand.mutateAsync({ pdv_id: pdvId, brand_id: pdvDialogBrand.id });
      toast.success('PDV vinculado');
    } catch (e: any) { toast.error(e.message); }
  };

  const handleUnlinkPdv = async (pbId: string) => {
    try {
      await removePdvBrand.mutateAsync(pbId);
      toast.success('PDV desvinculado');
    } catch (e: any) { toast.error(e.message); }
  };

  const handleLinkByNetwork = async () => {
    if (!selectedNetwork || !pdvDialogBrand?.id) return;
    try {
      const r = await addPdvBrandByNetwork.mutateAsync({ brand_id: pdvDialogBrand.id, rede_id: selectedNetwork });
      toast.success(`${r?.linked ?? 0} PDV(s) vinculado(s) via rede`);
      setSelectedNetwork('');
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <MainLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary" />
            Gestão de Marcas
          </h1>
          <Button variant="outline" size="sm" asChild>
            <Link to="/merch/dashboard" className="flex items-center gap-2">
              <LayoutDashboard className="h-4 w-4" /> Dashboard
            </Link>
          </Button>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="flex gap-2 flex-1 w-full sm:w-auto">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar por nome, código ou CNPJ..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="active">Ativo</SelectItem>
                <SelectItem value="inactive">Inativo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            {selectedIds.size > 0 && (
              <Button 
                variant="destructive" 
                onClick={() => {
                  if (confirm(`Excluir ${selectedIds.size} marca(s) selecionada(s)? Esta ação também excluirá os produtos e mix vinculados a estas marcas.`)) {
                    handleBulkDelete();
                  }
                }}
              >
                <Trash2 className="h-4 w-4 mr-2" />Excluir Selecionados ({selectedIds.size})
              </Button>
            )}
            {isAdmin && (
              <>
                <Button variant="outline" onClick={handleExport} disabled={exporting}>
                  <Download className="h-4 w-4 mr-2" />
                  {exporting ? 'Exportando...' : 'Exportar'}
                </Button>
                <Button variant="outline" onClick={() => setImportOpen(true)}>
                  <Upload className="h-4 w-4 mr-2" />Importar Marcas
                </Button>
                <Button variant="outline" onClick={() => setLinkImportOpen(true)}>
                  <Link2 className="h-4 w-4 mr-2" />Importar Marca x PDV
                </Button>
              </>
            )}
            <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" />Nova Marca</Button>
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox checked={brands.length > 0 && selectedIds.size === brands.length} onCheckedChange={toggleAll} />
                  </TableHead>
                  <TableHead className="w-20">Código</TableHead>
                  <TableHead>Marca</TableHead>
                  <TableHead className="hidden md:table-cell">Segmento</TableHead>
                  <TableHead className="hidden md:table-cell">Responsável</TableHead>
                  <TableHead>PDVs</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {brands.map((b: any) => (
                  <TableRow key={b.id} className={selectedIds.has(b.id) ? 'bg-primary/5' : ''}>
                    <TableCell>
                      <Checkbox checked={selectedIds.has(b.id)} onCheckedChange={() => toggleOne(b.id)} />
                    </TableCell>
                    <TableCell className="font-mono text-xs font-bold text-primary">{b.internal_code || '-'}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {b.logo_url ? (
                          <img src={b.logo_url} alt={b.name} className="h-8 w-8 rounded object-cover" />
                        ) : (
                          <div className="h-8 w-8 rounded bg-primary/10 flex items-center justify-center">
                            <Building2 className="h-4 w-4 text-primary" />
                          </div>
                        )}
                        <div>
                          <p className="font-medium">{b.name}</p>
                          {b.cnpj && <p className="text-xs text-muted-foreground">{b.cnpj}</p>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{b.segment || '-'}</TableCell>
                    <TableCell className="hidden md:table-cell">{b.responsible || '-'}</TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { setPdvDialogBrand(b); setPdvSearch(''); }}>
                        <Store className="h-3 w-3 mr-1" /> PDVs
                      </Button>
                    </TableCell>
                    <TableCell>
                      <Badge variant={b.status === 'active' ? 'default' : 'secondary'}>
                        {b.status === 'active' ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(b)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(b.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {!isLoading && brands.length === 0 && (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Nenhuma marca cadastrada</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Brand Import Dialog */}
      <BrandImportDialog open={importOpen} onOpenChange={setImportOpen} />
      <BrandPdvLinkImportDialog open={linkImportOpen} onOpenChange={setLinkImportOpen} />

      {/* Brand Form Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? 'Editar Marca' : 'Nova Marca'}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Código Interno</Label><Input value={form.internal_code || ''} onChange={e => set('internal_code', e.target.value)} /></div>
            <div className="space-y-2"><Label>Nome *</Label><Input value={form.name} onChange={e => set('name', e.target.value)} /></div>
            <div className="space-y-2"><Label>Razão Social</Label><Input value={form.razao_social} onChange={e => set('razao_social', e.target.value)} /></div>
            <div className="space-y-2"><Label>CNPJ</Label><Input value={form.cnpj} onChange={e => set('cnpj', e.target.value)} /></div>
            <div className="space-y-2"><Label>Segmento</Label><Input value={form.segment} onChange={e => set('segment', e.target.value)} /></div>
            <div className="space-y-2"><Label>Responsável</Label><Input value={form.responsible} onChange={e => set('responsible', e.target.value)} /></div>
            <div className="space-y-2"><Label>Telefone</Label><Input value={form.phone} onChange={e => set('phone', e.target.value)} /></div>
            <div className="space-y-2"><Label>E-mail</Label><Input value={form.email} onChange={e => set('email', e.target.value)} /></div>
            <div className="space-y-2"><Label>CEP</Label><Input value={form.zip} onChange={e => set('zip', e.target.value)} /></div>
            <div className="space-y-2"><Label>Cidade</Label><Input value={form.city} onChange={e => set('city', e.target.value)} /></div>
            <div className="col-span-full grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2 space-y-2"><Label>Rua</Label><Input value={form.street} onChange={e => set('street', e.target.value)} /></div>
              <div className="space-y-2"><Label>Número</Label><Input value={form.number} onChange={e => set('number', e.target.value)} /></div>
            </div>
            <div className="space-y-2"><Label>Bairro</Label><Input value={form.neighborhood} onChange={e => set('neighborhood', e.target.value)} /></div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => set('status', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Ativo</SelectItem>
                  <SelectItem value="inactive">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-full space-y-2"><Label>Logotipo</Label><FileUploadInput value={form.logo_url || ''} onChange={v => set('logo_url', v)} accept="image/*" /></div>
            <div className="col-span-full space-y-2"><Label>Descrição</Label><Textarea value={form.description} onChange={e => set('description', e.target.value)} rows={2} /></div>
            <div className="col-span-full space-y-2"><Label>Observações</Label><Textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={createBrand.isPending || updateBrand.isPending}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PDV Assignment Dialog */}
      <Dialog open={!!pdvDialogBrand} onOpenChange={() => setPdvDialogBrand(null)}>
        <DialogContent className="max-w-4xl w-[95vw] max-h-[90vh] h-[90vh] flex flex-col overflow-hidden p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Store className="h-5 w-5 text-primary" />
              PDVs da marca: {pdvDialogBrand?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="relative mb-3 shrink-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar PDV..." value={pdvSearch} onChange={e => setPdvSearch(e.target.value)} className="pl-9" />
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mb-3 shrink-0 p-2 rounded-md border bg-muted/30">
            <Label className="text-xs shrink-0 flex items-center gap-1"><Link2 className="h-3.5 w-3.5" /> Vincular por Rede:</Label>
            <Select value={selectedNetwork} onValueChange={setSelectedNetwork}>
              <SelectTrigger className="h-9 flex-1"><SelectValue placeholder="Selecione uma rede..." /></SelectTrigger>
              <SelectContent>
                {networks.map((n: any) => (
                  <SelectItem key={n.id} value={n.id}>{n.name} {typeof n.pdv_count === 'number' ? `(${n.pdv_count} PDVs)` : ''}</SelectItem>
                ))}
                {networks.length === 0 && <div className="px-2 py-1.5 text-xs text-muted-foreground">Nenhuma rede cadastrada</div>}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={handleLinkByNetwork} disabled={!selectedNetwork || addPdvBrandByNetwork.isPending}>
              {addPdvBrandByNetwork.isPending ? 'Vinculando...' : 'Vincular todos'}
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-3 flex-1 min-h-0 overflow-hidden">
            <div className="border rounded-lg p-3 flex flex-col min-h-0 overflow-hidden">
              <p className="text-sm font-medium text-muted-foreground mb-2 shrink-0">Disponíveis ({filteredAvailable.length})</p>
              <ScrollArea className="flex-1 min-h-0">
                {filteredAvailable.map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between p-2 hover:bg-muted rounded-md mb-1 cursor-pointer group"
                    onClick={() => handleLinkPdv(p.id)}>
                    <div className="flex items-center gap-2 min-w-0">
                      <Store className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{p.name}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{[p.city, p.state].filter(Boolean).join(' - ')}</p>
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-primary opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  </div>
                ))}
                {filteredAvailable.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Nenhum PDV disponível</p>}
              </ScrollArea>
            </div>
            <div className="flex md:flex-col items-center justify-center gap-2">
              <ArrowRight className="h-5 w-5 text-primary hidden md:block" />
              <ArrowLeft className="h-5 w-5 text-destructive hidden md:block" />
            </div>
            <div className="border rounded-lg p-3 border-primary/30 bg-primary/5 flex flex-col min-h-0 overflow-hidden">
              <p className="text-sm font-medium mb-2 shrink-0">Selecionados ({filteredLinked.length})</p>
              <ScrollArea className="flex-1 min-h-0">
                {filteredLinked.map((bp: any) => (
                  <div key={bp.id} className="flex items-center justify-between p-2 hover:bg-destructive/10 rounded-md mb-1 cursor-pointer group"
                    onClick={() => handleUnlinkPdv(bp.id)}>
                    <div className="flex items-center gap-2 min-w-0">
                      <Store className="h-4 w-4 text-primary shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{bp.pdv_name}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{[bp.city, bp.state].filter(Boolean).join(' - ')}</p>
                      </div>
                    </div>
                    <Trash2 className="h-4 w-4 text-destructive opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  </div>
                ))}
                {filteredLinked.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Nenhum PDV vinculado</p>}
              </ScrollArea>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
