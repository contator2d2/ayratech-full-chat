import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { ZoomIn, ZoomOut, RotateCw, RotateCcw, Download, Camera, ChevronLeft, ChevronRight } from 'lucide-react';
import { resolveMediaUrl } from '@/lib/media';
import { downloadPhotoAsJpg, type ExportablePhoto } from '@/lib/photo-export';

export interface LightboxPhoto extends ExportablePhoto {
  [key: string]: any;
}

interface PhotoLightboxProps {
  photo: LightboxPhoto | null;
  onClose: () => void;
  typeLabels?: Record<string, string>;
  onRotate?: (delta: number) => Promise<number | void> | void;
  onPrev?: () => void;
  onNext?: () => void;
}

export function PhotoLightbox({ photo, onClose, typeLabels = {}, onRotate, onPrev, onNext }: PhotoLightboxProps) {
  const [zoom, setZoom] = useState(1);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => { setZoom(1); }, [photo?.id]);

  const url = photo ? resolveMediaUrl(photo.photo_url) : null;
  const rotation = photo?.rotation || 0;

  return (
    <Dialog open={!!photo} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-2">
            <Camera className="h-4 w-4" />
            {typeLabels[photo?.photo_type || ''] || photo?.photo_type || 'Foto'}
            {photo?.product_name || photo?.category_name ? ` — ${photo?.product_name || photo?.category_name}` : ''}
          </DialogTitle>
          <DialogDescription>Ampliar, girar e exportar em JPG</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative w-full bg-muted rounded-lg overflow-auto max-h-[65vh] flex items-center justify-center">
            {url ? (
              <img
                src={url}
                alt={photo?.category_name || 'Foto'}
                className="object-contain transition-transform origin-center"
                style={{ transform: `rotate(${rotation}deg) scale(${zoom})`, maxHeight: '65vh', maxWidth: '100%' }}
              />
            ) : (
              <div className="flex flex-col items-center gap-2 text-muted-foreground py-16">
                <Camera className="h-8 w-8" />
                <span className="text-xs">Imagem aguardando sincronismo do app</span>
              </div>
            )}

            {onPrev && (
              <Button size="sm" variant="secondary" className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 p-0" onClick={onPrev}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
            )}
            {onNext && (
              <Button size="sm" variant="secondary" className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 p-0" onClick={onNext}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setZoom(z => Math.max(0.5, +(z - 0.25).toFixed(2)))}>
              <ZoomOut className="h-4 w-4" />
            </Button>
            <Badge variant="secondary" className="text-xs">{Math.round(zoom * 100)}%</Badge>
            <Button size="sm" variant="outline" onClick={() => setZoom(z => Math.min(4, +(z + 0.25).toFixed(2)))}>
              <ZoomIn className="h-4 w-4" />
            </Button>
            {onRotate && (
              <>
                <Button size="sm" variant="outline" onClick={() => onRotate(-90)} title="Girar à esquerda">
                  <RotateCcw className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="outline" onClick={() => onRotate(90)} title="Girar à direita">
                  <RotateCw className="h-4 w-4" />
                </Button>
              </>
            )}
            <Button
              size="sm"
              disabled={!url || downloading}
              onClick={async () => {
                if (!photo) return;
                setDownloading(true);
                const ok = await downloadPhotoAsJpg(photo);
                setDownloading(false);
                if (!ok) toast.error('Não foi possível exportar esta foto');
              }}
            >
              <Download className="h-4 w-4 mr-1" /> {downloading ? 'Gerando…' : 'Baixar JPG'}
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div><span className="text-muted-foreground">Loja:</span> {photo?.pdv_name || '—'}</div>
            <div><span className="text-muted-foreground">Marca:</span> {photo?.brand_name || '—'}</div>
            <div><span className="text-muted-foreground">Promotor:</span> {photo?.promoter_name || '—'}</div>
            <div><span className="text-muted-foreground">Data:</span> {photo?.captured_at ? new Date(photo.captured_at).toLocaleString('pt-BR') : '—'}</div>
            <div><span className="text-muted-foreground">Categoria:</span> {photo?.category_name || '—'}</div>
            <div><span className="text-muted-foreground">Produto:</span> {photo?.product_name || '—'}</div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
