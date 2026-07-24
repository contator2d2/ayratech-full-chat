import { useState, useMemo } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { usePhotoBook, useRotatePhoto } from "@/hooks/use-merch-routes";
import { useBrands, useCategories } from "@/hooks/use-merchandising";
import { usePDVs } from "@/hooks/use-promotor";
import { usePromoters } from "@/hooks/use-access-control";
import { useRedes } from "@/hooks/use-price-research";
import { resolveMediaUrl } from "@/lib/media";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { Camera, Image, Eye, Calendar, MapPin, Tag, User, ZoomIn, FileText, CheckSquare, RotateCw, RotateCcw, ChevronDown, X } from "lucide-react";
import { BookEditorDialog } from "@/components/merch/BookEditorDialog";
import { toast } from "sonner";

const PHOTO_TYPES: Record<string, string> = {
  checkin: 'Check-in', checkout: 'Check-out', before: 'Antes', after: 'Depois',
  category_before: 'Antes (Categoria)', category_after: 'Depois (Categoria)',
  stock: 'Estoque', shelf: 'Prateleira', extra_point: 'Ponto Extra',
  damage: 'Avaria', expiry: 'Validade', contingency: 'Contingência',
  rupture: 'Ruptura',
};

export default function MerchBookFotos() {
  const [brandFilter, setBrandFilter] = useState('');
  const [pdvFilter, setPdvFilter] = useState<string[]>([]);
  const [promoterFilter, setPromoterFilter] = useState<string[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [supervisorFilter, setSupervisorFilter] = useState<string[]>([]);
  const [photoTypeFilter, setPhotoTypeFilter] = useState<string[]>([]);
  const [redeFilter, setRedeFilter] = useState<string[]>([]);
  const [cityFilter, setCityFilter] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [viewPhoto, setViewPhoto] = useState<any>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bookEditorOpen, setBookEditorOpen] = useState(false);
  const rotateMut = useRotatePhoto();

  const { data: brands = [] } = useBrands();
  const { data: pdvs = [] } = usePDVs();
  const { data: promoters = [] } = usePromoters();
  const { data: categories = [] } = useCategories();
  const { data: redes = [] } = useRedes();

  // Supervisors = employees that appear as supervisor_id of any promoter
  const supervisors = useMemo(() => {
    const map = new Map<string, string>();
    (promoters as any[]).forEach((p: any) => {
      if (p.supervisor_id && p.supervisor_name) map.set(p.supervisor_id, p.supervisor_name);
    });
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [promoters]);

  // City options derived from PDVs
  const cities = useMemo(() => {
    const set = new Set<string>();
    (pdvs as any[]).forEach((p: any) => { if (p.city) set.add(p.city); });
    return Array.from(set).sort();
  }, [pdvs]);

  const { data: photos = [], isLoading } = usePhotoBook({
    brand_id: brandFilter || undefined,
    pdv_id: pdvFilter.length ? pdvFilter.join(',') : undefined,
    promoter_id: promoterFilter.length ? promoterFilter.join(',') : undefined,
    category_id: categoryFilter.length ? categoryFilter.join(',') : undefined,
    supervisor_id: supervisorFilter.length ? supervisorFilter.join(',') : undefined,
    photo_type: photoTypeFilter.length ? photoTypeFilter.join(',') : undefined,
    rede_id: redeFilter.length ? redeFilter.join(',') : undefined,
    city: cityFilter.length ? cityFilter.join(',') : undefined,
    date_from: dateFrom, date_to: dateTo,
  });

  const toggleIn = (setter: React.Dispatch<React.SetStateAction<string[]>>) => (id: string) => {
    setter(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  const togglePdv = toggleIn(setPdvFilter);
  const togglePromoter = toggleIn(setPromoterFilter);
  const toggleCategory = toggleIn(setCategoryFilter);
  const toggleSupervisor = toggleIn(setSupervisorFilter);
  const togglePhotoType = toggleIn(setPhotoTypeFilter);
  const toggleRede = toggleIn(setRedeFilter);
  const toggleCity = toggleIn(setCityFilter);

  const buildLabel = (arr: string[], list: { id: string; name: string }[], allLabel: string, singularSuffix = '') => {
    if (arr.length === 0) return allLabel;
    if (arr.length === 1) return list.find(x => x.id === arr[0])?.name || `1${singularSuffix}`;
    return `${arr.length} selecionados`;
  };
  const pdvLabel = buildLabel(pdvFilter, (pdvs as any[]).map((p: any) => ({ id: p.id, name: p.name })), 'Todos os PDVs');
  const promoterLabel = buildLabel(promoterFilter, (promoters as any[]).map((p: any) => ({ id: p.id, name: p.full_name || p.name })), 'Todos os colaboradores');
  const categoryLabel = buildLabel(categoryFilter, (categories as any[]).map((c: any) => ({ id: c.id, name: c.name })), 'Todas as categorias');
  const supervisorLabel = buildLabel(supervisorFilter, supervisors, 'Todos os supervisores');
  const photoTypeLabel = photoTypeFilter.length === 0 ? 'Todos os tipos'
    : photoTypeFilter.length === 1 ? (PHOTO_TYPES[photoTypeFilter[0]] || photoTypeFilter[0])
    : `${photoTypeFilter.length} tipos`;
  const redeLabel = buildLabel(redeFilter, (redes as any[]).map((r: any) => ({ id: r.id, name: r.name })), 'Todas as redes');
  const cityLabel = cityFilter.length === 0 ? 'Todas as cidades'
    : cityFilter.length === 1 ? cityFilter[0]
    : `${cityFilter.length} cidades`;

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === photos.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set((photos as any[]).map((p: any) => p.id)));
    }
  };

  // Select all photos from a specific brand within a specific PDV
  const selectAllBrandPdv = (brandName: string, pdvName: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      const matching = (photos as any[]).filter((p: any) => (p.brand_name || 'Marca') === brandName && (p.pdv_name || 'PDV') === pdvName);
      const allSelected = matching.every(p => next.has(p.id));
      if (allSelected) {
        matching.forEach(p => next.delete(p.id));
      } else {
        matching.forEach(p => next.add(p.id));
      }
      return next;
    });
  };

  const selectedPhotos = useMemo(() => 
    (photos as any[]).filter((p: any) => selectedIds.has(p.id)),
    [photos, selectedIds]
  );

  // Get the first brand name from selection for the editor
  const firstBrand = selectedPhotos.length > 0 ? selectedPhotos[0].brand_name : '';
  
  // Find the matching brand object to pass logo_url
  const selectedBrandObj = useMemo(() => {
    if (!firstBrand) return null;
    return (brands as any[]).find((b: any) => b.name === firstBrand) || null;
  }, [firstBrand, brands]);

  // Group by date → PDV → brand
  const grouped = (photos as any[]).reduce((acc: any, p: any) => {
    const date = p.captured_at?.slice(0, 10) || 'sem-data';
    const pdv = p.pdv_name || 'PDV';
    const brand = p.brand_name || 'Marca';
    if (!acc[date]) acc[date] = {};
    if (!acc[date][pdv]) acc[date][pdv] = {};
    if (!acc[date][pdv][brand]) acc[date][pdv][brand] = [];
    acc[date][pdv][brand].push(p);
    return acc;
  }, {} as Record<string, any>);

  const sortedDates = Object.keys(grouped).sort().reverse();

  return (
    <MainLayout>
      <div className="space-y-4">
        {/* Filters */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex flex-wrap gap-3 items-end">
              <div className="flex-1 min-w-[150px]">
                <Select value={brandFilter || '__all__'} onValueChange={v => setBrandFilter(v === '__all__' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="Marca" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Todas as marcas</SelectItem>
                    {brands.filter((b: any) => b?.id).map((b: any) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <MultiSelectPopover label={pdvLabel} values={pdvFilter} options={(pdvs as any[]).filter((p: any) => p?.id).map((p: any) => ({ id: p.id, name: p.name }))} onToggle={togglePdv} onClear={() => setPdvFilter([])} />
              <MultiSelectPopover label={promoterLabel} values={promoterFilter} options={(promoters as any[]).filter((p: any) => p?.id).map((p: any) => ({ id: p.id, name: p.full_name || p.name }))} onToggle={togglePromoter} onClear={() => setPromoterFilter([])} />
              <MultiSelectPopover label={supervisorLabel} values={supervisorFilter} options={supervisors} onToggle={toggleSupervisor} onClear={() => setSupervisorFilter([])} />
              <MultiSelectPopover label={categoryLabel} values={categoryFilter} options={(categories as any[]).filter((c: any) => c?.id).map((c: any) => ({ id: c.id, name: c.name }))} onToggle={toggleCategory} onClear={() => setCategoryFilter([])} />
              <MultiSelectPopover label={photoTypeLabel} values={photoTypeFilter} options={Object.entries(PHOTO_TYPES).map(([id, name]) => ({ id, name }))} onToggle={togglePhotoType} onClear={() => setPhotoTypeFilter([])} />
              <MultiSelectPopover label={redeLabel} values={redeFilter} options={(redes as any[]).filter((r: any) => r?.id).map((r: any) => ({ id: r.id, name: r.name }))} onToggle={toggleRede} onClear={() => setRedeFilter([])} />
              <MultiSelectPopover label={cityLabel} values={cityFilter} options={cities.map((c) => ({ id: c, name: c }))} onToggle={toggleCity} onClear={() => setCityFilter([])} />
              <div>
                <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-36" />
              </div>
              <div>
                <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-36" />
              </div>
              {(brandFilter || pdvFilter.length || promoterFilter.length || categoryFilter.length || supervisorFilter.length || photoTypeFilter.length || redeFilter.length || cityFilter.length) ? (
                <Button variant="ghost" size="sm" onClick={() => { setBrandFilter(''); setPdvFilter([]); setPromoterFilter([]); setCategoryFilter([]); setSupervisorFilter([]); setPhotoTypeFilter([]); setRedeFilter([]); setCityFilter([]); }}>
                  <X className="h-4 w-4 mr-1" /> Limpar filtros
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>

        {/* Selection bar */}
        {photos.length > 0 && (
          <div className="flex items-center gap-3 flex-wrap">
            <Button variant="outline" size="sm" onClick={toggleSelectAll}>
              <CheckSquare className="h-4 w-4 mr-1" />
              {selectedIds.size === photos.length ? 'Desmarcar tudo' : 'Selecionar tudo'}
            </Button>
            {selectedIds.size > 0 && (
              <>
                <Badge variant="default" className="text-sm">{selectedIds.size} selecionadas</Badge>
                <Button size="sm" onClick={() => setBookEditorOpen(true)}>
                  <FileText className="h-4 w-4 mr-1" /> Criar Book
                </Button>
              </>
            )}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card><CardContent className="pt-4 text-center">
            <Camera className="h-5 w-5 mx-auto mb-1 text-primary" />
            <div className="text-2xl font-bold">{photos.length}</div>
            <p className="text-xs text-muted-foreground">Total de fotos</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4 text-center">
            <Calendar className="h-5 w-5 mx-auto mb-1 text-primary" />
            <div className="text-2xl font-bold">{sortedDates.length}</div>
            <p className="text-xs text-muted-foreground">Dias com fotos</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4 text-center">
            <MapPin className="h-5 w-5 mx-auto mb-1 text-primary" />
            <div className="text-2xl font-bold">{new Set((photos as any[]).map((p: any) => p.pdv_id)).size}</div>
            <p className="text-xs text-muted-foreground">PDVs</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4 text-center">
            <User className="h-5 w-5 mx-auto mb-1 text-primary" />
            <div className="text-2xl font-bold">{new Set((photos as any[]).map((p: any) => p.promoter_id)).size}</div>
            <p className="text-xs text-muted-foreground">Promotores</p>
          </CardContent></Card>
        </div>

        {/* Photo Grid grouped */}
        {sortedDates.map(date => (
          <div key={date} className="space-y-3">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              {new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
            </h2>
            {Object.entries(grouped[date]).map(([pdv, brandGroups]: [string, any]) => (
              <Card key={pdv}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><MapPin className="h-4 w-4" /> {pdv}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {Object.entries(brandGroups).map(([brand, bPhotos]: [string, any]) => {
                    const allBrandPdvSelected = bPhotos.every((p: any) => selectedIds.has(p.id));
                    return (
                    <div key={brand}>
                      <div className="flex items-center gap-2 mb-2">
                        <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-xs font-medium">{brand}</span>
                        <Badge variant="secondary" className="text-[10px]">{bPhotos.length} fotos</Badge>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-6 px-2 text-[10px]"
                          onClick={() => selectAllBrandPdv(brand, pdv)}
                        >
                          <CheckSquare className="h-3 w-3 mr-1" />
                          {allBrandPdvSelected ? 'Desmarcar' : 'Selecionar todas'}
                        </Button>
                      </div>
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                        {bPhotos.map((photo: any) => {
                          const photoUrl = resolveMediaUrl(photo.photo_url);
                          if (!photoUrl) return null;
                          const isSelected = selectedIds.has(photo.id);

                          return (
                          <div key={photo.id} className={`relative group cursor-pointer aspect-square rounded-lg overflow-hidden border bg-muted ${isSelected ? 'ring-2 ring-primary' : ''}`}>
                            {/* Checkbox */}
                            <div className="absolute top-1 left-1 z-10" onClick={e => { e.stopPropagation(); toggleSelect(photo.id); }}>
                              <Checkbox checked={isSelected} className="bg-background/80 border-background/80" />
                            </div>
                            <div onClick={() => setViewPhoto({ ...photo, photo_url: photoUrl })}>
                              {photoUrl ? (
                                <img 
                                  src={photoUrl} 
                                  alt={photo.product_name || photo.category_name || 'Foto de execução'} 
                                  className="w-full h-full object-cover transition-transform" 
                                  style={photo.rotation ? { transform: `rotate(${photo.rotation}deg)` } : undefined}
                                  loading="lazy" 
                                  onError={(e) => {
                                    // If image fails (session blob), hide it from the book selection
                                    const target = e.target as HTMLImageElement;
                                    const parent = target.closest('.relative');
                                    if (parent) (parent as HTMLElement).style.display = 'none';
                                  }}
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center"><Image className="h-6 w-6 text-muted-foreground" /></div>
                              )}
                              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                                <ZoomIn className="h-5 w-5 text-white" />
                              </div>
                            </div>
                            <Badge className="absolute bottom-1 left-1 text-[8px] py-0 px-1" variant="secondary">
                              {PHOTO_TYPES[photo.photo_type] || photo.photo_type}
                            </Badge>
                            {photo.upload_source === 'web' && (
                              <Badge className="absolute top-1 right-1 text-[8px] py-0 px-1 bg-orange-500 text-white">WEB</Badge>
                            )}
                          </div>
                        )})}
                      </div>
                    </div>
                  )})}
                </CardContent>
              </Card>
            ))}
          </div>
        ))}

        {photos.length === 0 && !isLoading && (
          <Card><CardContent className="py-12 text-center text-muted-foreground">
            <Camera className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p>Nenhuma foto encontrada no período selecionado</p>
          </CardContent></Card>
        )}
      </div>

      {/* Photo Viewer */}
      <Dialog open={!!viewPhoto} onOpenChange={() => setViewPhoto(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <Camera className="h-4 w-4" />
              {PHOTO_TYPES[viewPhoto?.photo_type] || viewPhoto?.photo_type} — {viewPhoto?.product_name || viewPhoto?.category_name || 'Geral'}
            </DialogTitle>
            <DialogDescription>Detalhes da foto de execução</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {viewPhoto?.photo_url && (
              <div className="relative">
                <div className="w-full rounded-lg max-h-[60vh] bg-muted overflow-hidden flex items-center justify-center">
                  <img
                    src={viewPhoto.photo_url}
                    alt=""
                    className="max-h-[60vh] max-w-full object-contain transition-transform"
                    style={viewPhoto.rotation ? { transform: `rotate(${viewPhoto.rotation}deg)` } : undefined}
                  />
                </div>
                <div className="absolute top-2 right-2 flex gap-1">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-8 w-8 p-0"
                    disabled={rotateMut.isPending}
                    onClick={async () => {
                      try {
                        const r = await rotateMut.mutateAsync({ id: viewPhoto.id, delta: -90 });
                        setViewPhoto({ ...viewPhoto, rotation: r.rotation });
                      } catch { toast.error('Não foi possível girar a foto'); }
                    }}
                    title="Girar 90° à esquerda"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-8 w-8 p-0"
                    disabled={rotateMut.isPending}
                    onClick={async () => {
                      try {
                        const r = await rotateMut.mutateAsync({ id: viewPhoto.id, delta: 90 });
                        setViewPhoto({ ...viewPhoto, rotation: r.rotation });
                      } catch { toast.error('Não foi possível girar a foto'); }
                    }}
                    title="Girar 90° à direita"
                  >
                    <RotateCw className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div><span className="text-muted-foreground">Promotor:</span> {viewPhoto?.promoter_name || '—'}</div>
              <div><span className="text-muted-foreground">Data:</span> {viewPhoto?.captured_at ? new Date(viewPhoto.captured_at).toLocaleString('pt-BR') : '—'}</div>
              <div><span className="text-muted-foreground">Produto:</span> {viewPhoto?.product_name || '—'}</div>
              <div><span className="text-muted-foreground">Categoria:</span> {viewPhoto?.category_name || '—'}</div>
              <div><span className="text-muted-foreground">Origem:</span> {viewPhoto?.upload_source === 'web' ? '🖥️ Upload via Web (supervisor)' : '📱 App do promotor'}</div>
              {viewPhoto?.contingency_reason && <div className="col-span-2"><span className="text-muted-foreground">Motivo contingência:</span> {viewPhoto.contingency_reason}</div>}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Book Editor */}
      {bookEditorOpen && (
        <BookEditorDialog
          open={bookEditorOpen}
          onOpenChange={setBookEditorOpen}
          photos={selectedPhotos}
          brandName={firstBrand}
          brandLogoUrl={selectedBrandObj?.logo_url || undefined}
          brands={brands as any[]}
        />
      )}
    </MainLayout>
  );
}
