import { useState, useRef, useEffect } from "react";
import { resolveMediaUrl } from "@/lib/media";
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
import { useProducts, useCreateProduct, useUpdateProduct, useDeleteProduct, useBulkDeleteProducts, useBrands, useCategories, useSubcategories, useImportProducts } from "@/hooks/use-merchandising";
import { FileUploadInput } from "@/components/ui/file-upload-input";
import { mapProductImportRow, parseImportFile } from "@/lib/merch-import";
import { Plus, Search, Pencil, Trash2, Package, Upload, Download } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

const emptyProduct = { name: '', brand_id: '', category_id: '', subcategory_id: '', sku: '', internal_code: '', barcode: '', description: '', image_url: '', unit: 'un', status: 'active' };

export default function MerchProdutos() {
  const [search, setSearch] = useState('');
  const [brandFilter, setBrandFilter] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [form, setForm] = useState<any>(emptyProduct);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [importProgress, setImportProgress] = useState<{ 
    total: number; current: number; success: number; created: number; updated: number; errors: number; isOpen: boolean;
    errorList: any[];
  }>({
    total: 0, current: 0, success: 0, created: 0, updated: 0, errors: 0, isOpen: false, errorList: []
  });
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: products = [], isLoading } = useProducts({ search, brand_id: brandFilter, category_id: catFilter });
  const { data: brands = [] } = useBrands();
  const { data: categories = [] } = useCategories();
  const { data: subcategories = [] } = useSubcategories(form.category_id || undefined);
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();
  const bulkDeleteProducts = useBulkDeleteProducts();
  const importProducts = useImportProducts();

  const openNew = () => { setForm({ ...emptyProduct }); setEditingId(null); setDialogOpen(true); };
  const openEdit = (p: any) => { setForm({ ...p }); setEditingId(p.id); setDialogOpen(true); };
  const set = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));

  const handleSave = async () => {
    if (!form.name || !form.brand_id) { toast.error('Preencha nome e marca'); return; }
    try {
      if (editingId) { await updateProduct.mutateAsync({ id: editingId, ...form }); toast.success('Atualizado'); }
      else { await createProduct.mutateAsync(form); toast.success('Criado'); }
      setDialogOpen(false);
    } catch (e: any) { toast.error(e.message); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir produto?')) return;
    try { await deleteProduct.mutateAsync(id); toast.success('Excluído'); } catch (e: any) { toast.error(e.message); }
  };

  const handleBulkDelete = async () => {
    if (!selectedIds.size) return;
    if (!confirm(`Excluir ${selectedIds.size} produto(s) selecionado(s)?`)) return;

    try {
      const result = await bulkDeleteProducts.mutateAsync(Array.from(selectedIds));
      setSelectedIds(new Set());
      toast.success(`${result.deleted} excluído(s)`);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const toggleAll = () => {
    if (selectedIds.size === products.length) {
      setSelectedIds(new Set());
      return;
    }

    setSelectedIds(new Set(products.map((product: any) => product.id)));
  };

  const toggleOne = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const rows = await parseImportFile(file);
      const allItems = rows.map(mapProductImportRow).filter(item => item.name);
      
      if (!allItems.length) {
        toast.error('Nenhuma linha válida de produto foi reconhecida no arquivo');
        return;
      }

      setImportProgress({
        total: allItems.length,
        current: 0,
        success: 0,
        created: 0,
        updated: 0,
        errors: 0,
        isOpen: true,
        errorList: []
      });
      
      const chunkSize = 20;
      let successCount = 0;
      let createdCount = 0;
      let updatedCount = 0;
      let totalErrors = 0;
      let firstErrorMessage = "";

      for (let i = 0; i < allItems.length; i += chunkSize) {
        const chunk = allItems.slice(i, i + chunkSize);
        try {
          const result = await importProducts.mutateAsync({ items: chunk, auto_create: true });
          successCount += result.success || 0;
          createdCount += result.created || 0;
          updatedCount += result.updated || 0;
          
          let chunkErrors = [];
          if (result.errors?.length > 0) {
            totalErrors += result.errors.length;
            chunkErrors = result.errors;
            if (!firstErrorMessage) {
              const firstError = result.errors[0];
              firstErrorMessage = `Linha ${firstError.line || firstError.row || '-'}: ${firstError.error}`;
            }
          }

          setImportProgress(prev => ({
            ...prev,
            current: Math.min(i + chunkSize, allItems.length),
            success: successCount,
            created: createdCount,
            updated: updatedCount,
            errors: totalErrors,
            errorList: [...prev.errorList, ...chunkErrors]
          }));
        } catch (chunkErr: any) {
          console.error("Erro no lote de importação:", chunkErr);
          const chunkErrors = chunk.map((item, idx) => ({
            line: i + idx + 2,
            error: chunkErr.message || 'Falha na conexão/servidor',
            name: item.name
          }));
          
          totalErrors += chunk.length;
          if (!firstErrorMessage) firstErrorMessage = chunkErr.message;
          
          setImportProgress(prev => ({
            ...prev,
            current: Math.min(i + chunkSize, allItems.length),
            errors: totalErrors,
            errorList: [...prev.errorList, ...chunkErrors]
          }));
        }
      }

      if (successCount > 0) toast.success(`${successCount} produtos processados (Novos: ${createdCount}, Atualizados: ${updatedCount})`);
      if (totalErrors > 0) {
        toast.error(`${totalErrors} erro(s) durante a importação. ${firstErrorMessage}`);
      }
    } catch (err: any) { 
      console.error("Erro ao processar arquivo:", err);
      toast.error(err.message); 
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleExport = () => {
    const data = products.map((p: any) => ({
      nome: p.name, marca: p.brand_name, categoria: p.category_name, subcategoria: p.subcategory_name,
      sku: p.sku, codigo_barras: p.barcode, unidade: p.unit, status: p.status,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Produtos');
    XLSX.writeFile(wb, 'produtos.xlsx');
  };

  return (
    <MainLayout>
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="flex gap-2 flex-1 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar por nome, SKU, código ou cód. família..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={brandFilter} onValueChange={setBrandFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Marca" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {brands.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={catFilter} onValueChange={setCatFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Categoria" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {categories.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            {selectedIds.size > 0 && (
              <Button 
                variant="destructive" 
                onClick={() => {
                  if (confirm(`Excluir ${selectedIds.size} produto(s) selecionado(s)? Esta ação também removerá estes produtos de todos os Mix de PDVs.`)) {
                    handleBulkDelete();
                  }
                }}
              >
                <Trash2 className="h-4 w-4 mr-2" />Excluir Selecionados ({selectedIds.size})
              </Button>
            )}
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImportFile} />
            <Button variant="outline" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4 mr-2" />Importar</Button>
            <Button variant="outline" onClick={handleExport}><Download className="h-4 w-4 mr-2" />Exportar</Button>
            <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" />Novo Produto</Button>
          </div>
        </div>

        <Card><CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={products.length > 0 && selectedIds.size === products.length}
                    onCheckedChange={toggleAll}
                  />
                </TableHead>
                <TableHead>Produto</TableHead>
                <TableHead className="hidden md:table-cell">Cód. Família</TableHead>
                <TableHead className="hidden md:table-cell">Marca</TableHead>
                <TableHead className="hidden md:table-cell">Categoria</TableHead>
                <TableHead className="hidden lg:table-cell">SKU</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((p: any) => (
                <TableRow key={p.id} className={selectedIds.has(p.id) ? 'bg-primary/5' : ''}>
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.has(p.id)}
                      onCheckedChange={() => toggleOne(p.id)}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      {resolveMediaUrl(p.image_url) ? <img src={resolveMediaUrl(p.image_url)!} className="h-8 w-8 rounded object-cover" /> : <div className="h-8 w-8 rounded bg-primary/10 flex items-center justify-center"><Package className="h-4 w-4 text-primary" /></div>}
                      <div><p className="font-medium">{p.name}</p>{p.barcode && <p className="text-xs text-muted-foreground">{p.barcode}</p>}</div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell font-mono text-xs font-bold text-primary">{p.brand_code || '-'}</TableCell>
                  <TableCell className="hidden md:table-cell">{p.brand_name}</TableCell>
                  <TableCell className="hidden md:table-cell"><span>{p.category_name}</span>{p.subcategory_name && <span className="text-muted-foreground"> / {p.subcategory_name}</span>}</TableCell>
                  <TableCell className="hidden lg:table-cell">{p.sku || '-'}</TableCell>
                  <TableCell><Badge variant={p.status === 'active' ? 'default' : 'secondary'}>{p.status === 'active' ? 'Ativo' : 'Inativo'}</Badge></TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(p.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </TableCell>
                </TableRow>
              ))}
                {!isLoading && products.length === 0 && <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Nenhum produto</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent></Card>
      </div>

      <Dialog open={importProgress.isOpen} onOpenChange={(open) => !importProgress.current || importProgress.current === importProgress.total ? setImportProgress(prev => ({ ...prev, isOpen: open })) : null}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader><DialogTitle>Importando Produtos</DialogTitle></DialogHeader>
          <div className="py-6 space-y-4 overflow-y-auto flex-1 px-1">
            <div className="w-full bg-secondary rounded-full h-4 overflow-hidden">
              <div 
                className="bg-primary h-full transition-all duration-300" 
                style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
              />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div className="flex flex-col">
                <span className="text-muted-foreground text-xs uppercase">Progresso</span>
                <span className="font-bold">{importProgress.current} / {importProgress.total}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-muted-foreground text-xs uppercase text-green-600">Sucesso</span>
                <span className="font-bold text-green-600">{importProgress.success}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-muted-foreground text-xs uppercase">Novos</span>
                <span className="font-bold">{importProgress.created}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-muted-foreground text-xs uppercase text-blue-600">Atualizados</span>
                <span className="font-bold text-blue-600">{importProgress.updated}</span>
              </div>
            </div>

            {importProgress.errorList.length > 0 && (
              <div className="mt-4 space-y-2">
                <h4 className="font-bold text-sm text-destructive flex items-center gap-2">
                  <span>Lista de Erros ({importProgress.errorList.length})</span>
                </h4>
                <div className="border rounded-md max-h-[250px] overflow-y-auto bg-destructive/5">
                  <Table>
                    <TableHeader className="bg-muted/50 sticky top-0 z-10">
                      <TableRow>
                        <TableHead className="w-16 h-8 text-xs py-2">Linha</TableHead>
                        <TableHead className="h-8 text-xs py-2">Produto</TableHead>
                        <TableHead className="h-8 text-xs py-2">Motivo do Erro</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {importProgress.errorList.map((err, i) => (
                        <TableRow key={i}>
                          <TableCell className="py-2 text-xs font-mono">{err.line || err.row || '-'}</TableCell>
                          <TableCell className="py-2 text-xs font-medium">{err.name || 'Desconhecido'}</TableCell>
                          <TableCell className="py-2 text-xs text-destructive">{err.error}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="pt-4 border-t">
            <Button 
              disabled={importProgress.current < importProgress.total} 
              onClick={() => setImportProgress(prev => ({ ...prev, isOpen: false }))}
            >
              {importProgress.current < importProgress.total ? 'Importando...' : 'Fechar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? 'Editar' : 'Novo'} Produto</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Nome *</Label><Input value={form.name} onChange={e => set('name', e.target.value)} /></div>
            <div className="space-y-2"><Label>Marca *</Label>
              <Select value={form.brand_id} onValueChange={v => set('brand_id', v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent className="z-[9999]">{brands.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Categoria</Label>
              <Select value={form.category_id || "_none_"} onValueChange={v => { setForm(prev => ({ ...prev, category_id: v === '_none_' ? '' : v, subcategory_id: '' })); }}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent className="z-[9999]">
                  <SelectItem value="_none_">Nenhuma</SelectItem>
                  {categories.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Subcategoria</Label>
              <Select value={form.subcategory_id || "_none_"} onValueChange={v => set('subcategory_id', v === '_none_' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent className="z-[9999]">
                  <SelectItem value="_none_">Nenhuma</SelectItem>
                  {subcategories.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>SKU</Label><Input value={form.sku} onChange={e => set('sku', e.target.value)} /></div>
            <div className="space-y-2"><Label>Código Interno</Label><Input value={form.internal_code} onChange={e => set('internal_code', e.target.value)} /></div>
            <div className="space-y-2"><Label>Código de Barras</Label><Input value={form.barcode} onChange={e => set('barcode', e.target.value)} /></div>
            <div className="space-y-2"><Label>Unidade</Label>
              <Select value={form.unit} onValueChange={v => set('unit', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="z-[9999]">
                  <SelectItem value="un">Unidade</SelectItem>
                  <SelectItem value="cx">Caixa</SelectItem>
                  <SelectItem value="kg">Kg</SelectItem>
                  <SelectItem value="lt">Litro</SelectItem>
                  <SelectItem value="pc">Pacote</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-full space-y-2"><Label>Foto</Label><FileUploadInput value={form.image_url || ''} onChange={v => set('image_url', v)} accept="image/*" /></div>
            <div className="col-span-full space-y-2"><Label>Descrição</Label><Textarea value={form.description || ''} onChange={e => set('description', e.target.value)} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
