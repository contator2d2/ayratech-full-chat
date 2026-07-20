import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useOfflineSync } from "@/hooks/use-offline-sync";
import { useParams, useNavigate } from "react-router-dom";
import { PromotorLayout } from "./PromotorLayout";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CameraCapture, type PhotoQualityConfig } from "@/components/promotor/CameraCapture";
import { FaceVerifyDialog } from "@/components/facial-recognition/FaceVerifyDialog";
import { LocalImage } from "@/components/promotor/LocalImage";
import {
  usePromotorRouteDetail, usePromotorCheckin, usePromotorCheckout,
  usePromotorUpdateExecution, usePromotorReportDamage, usePromotorReportRupture,
  usePromotorAddValidity, usePromotorReportDiscard,
  usePromotorSetPointType, usePromotorCategoryPhoto, usePromotorCategoryAfterPhoto,
  usePromotorRegisterExtraPoint,
} from "@/hooks/use-promotor-routes";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import {
  MapPin, Camera, Check, AlertTriangle, Archive, Clock,
  CheckCircle2, Circle, Calendar as CalendarIcon, Trash2, Store, Info,
  Lock, Unlock, ChevronRight, ChevronDown, ChevronUp, Target, ImagePlus, Plus, ScanFace, Package,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { logger } from "@/lib/logger";
import { SyncStatusIndicator } from "@/components/promotor/SyncStatusIndicator";
import { StockCountCard } from "@/components/promotor/StockCountCard";
import { useRouteStockCount } from "@/hooks/use-stock-count";

// ===== Photo capture with Approve/Reject preview =====
function PhotoApprovalCapture({
  photos, onPhotosChange, min, isSending, onSubmit,
  cameraProps, label, accentColorClass = 'text-primary',
}: {
  photos: string[];
  onPhotosChange: (next: string[]) => void;
  min: number;
  allowExtras?: boolean; // ignored — kept for backward compatibility
  isSending: boolean;
  onSubmit: (photos: string[]) => void;
  cameraProps: any;
  label: string;
  submitLabel?: string; // ignored — kept for backward compatibility
  accentColorClass?: string;
}) {
  const submittedRef = useRef(false);

  const reachedMin = photos.length >= min;
  const needsMore = photos.length < min;

  const handleCapture = (url: string) => {
    const next = [...photos, url];
    onPhotosChange(next);
    if (next.length >= min && !submittedRef.current) {
      submittedRef.current = true;
      // Pass the freshly captured array — parent's `photos` state may not be flushed yet
      setTimeout(() => onSubmit(next), 0);
    }
  };

  const removeAt = (i: number) => {
    submittedRef.current = false;
    onPhotosChange(photos.filter((_, idx) => idx !== i));
  };

  return (
    <div className="space-y-2">
      <Label className={`text-xs font-semibold flex items-center gap-1 ${accentColorClass}`}>
        <Camera className="h-3.5 w-3.5" /> {label}
      </Label>
      {min > 1 && (
        <p className="text-[10px] text-muted-foreground">
          {reachedMin ? `${photos.length}/${min} fotos registradas` : `Tire ${min} foto(s). Faltam ${min - photos.length}.`}
        </p>
      )}

      {/* Thumbnails */}
      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((url, i) => (
            <div key={i} className="relative group">
              <LocalImage src={url} alt={`Foto ${i + 1}`} className="w-full h-20 rounded-lg border-2 border-green-500/40 object-cover" />
              <button
                onClick={() => removeAt(i)}
                className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full w-5 h-5 flex items-center justify-center text-[10px]"
                disabled={isSending}
              >✕</button>
              <div className="absolute bottom-1 left-1 bg-green-600 text-white rounded px-1 text-[9px] font-medium flex items-center gap-0.5">
                <Check className="h-2.5 w-2.5" /> {i + 1}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Camera (only while we still need more) */}
      {needsMore && (
        <CameraCapture
          {...cameraProps}
          onCapture={handleCapture}
          buttonLabel={photos.length === 0 ? 'Tirar foto' : `Tirar foto ${photos.length + 1}`}
        />
      )}

      {!needsMore && isSending && (
        <p className="text-[11px] text-center text-muted-foreground">Enviando...</p>
      )}

    </div>
  );
}

const EXEC_STATUS_ICON: Record<string, any> = {
  pending: <Circle className="h-4 w-4 text-muted-foreground" />,
  in_progress: <Clock className="h-4 w-4 text-yellow-500" />,
  completed: <CheckCircle2 className="h-4 w-4 text-green-500" />,
};

type ActionType = 'validity' | 'rupture' | 'damage' | 'discard' | null;

// PDV checkout hook
const usePromotorPdvCheckout = () => {
  const { queueApiCall } = useOfflineSync();
  const checkout = (data: any) => {
    return queueApiCall({
      url: '/api/merch/promotor/pdv-checkout',
      method: 'POST',
      body: data,
      headers: { 'Authorization': `Bearer ${localStorage.getItem('promotor_token') || localStorage.getItem('auth_token')}` }
    });
  };
  return { checkout };
};

// ===== Category Preparation Component =====
function CategoryPreparation({ category, catId, routeBrandId, categoryName, routeId, pdvName, brandName, promotorName, qualityConfig, minPhotos, photoMode, onUnlocked, onPointTypeSet }: {
  category: any; catId: string; routeBrandId?: string; categoryName: string; routeId: string; pdvName: string; brandName: string; promotorName?: string; qualityConfig?: PhotoQualityConfig; minPhotos: number; photoMode?: 'before' | 'after' | 'both'; onUnlocked: () => void; onPointTypeSet?: () => void;
}) {
  const setPointType = usePromotorSetPointType();
  const setCategoryPhoto = usePromotorCategoryPhoto();
  const [photos, setPhotos] = useState<string[]>([]);
  const [isSending, setIsSending] = useState(false);
  const { isOnline, queueApiCall } = useOfflineSync();


  // category may be null/undefined if no merch_execution_categories entry exists yet
  const hasPointType = !!category?.point_type;
  const hasPhoto = !!category?.category_before_photo;
  const isUnlocked = !!category?.products_unlocked || (hasPointType && (hasPhoto || photoMode === 'after'));
  const photoCount = photos.length + (hasPhoto ? 1 : 0);
  const min = Math.max(1, minPhotos || 1);

  const handleSetPointType = (type: string) => {
    logger.info(`Promotor tentando selecionar tipo de ponto: ${type}`, { routeId, catId, categoryName });
    
    // Se o modo for "after" (Somente Depois), já desbloqueamos os produtos imediatamente após escolher o tipo de ponto
    const shouldUnlockImmediately = photoMode === 'after';
    const notifySuccess = () => {
      if (shouldUnlockImmediately) onUnlocked();
      else onPointTypeSet?.();
    };

    if (!isOnline) {
      queueApiCall({
        url: `/api/merch/promotor/routes/${routeId}/categories/${catId}/point-type`,
        method: 'POST',
        body: { 
          route_brand_id: routeBrandId,
          point_type: type,
          products_unlocked: shouldUnlockImmediately 
        },
        headers: { 'Authorization': `Bearer ${localStorage.getItem('promotor_token') || localStorage.getItem('auth_token')}` }
      });
      notifySuccess();
      return;
    }
    setPointType.mutate({ 
      routeId, 
      catId, 
      route_brand_id: routeBrandId,
      point_type: type,
      products_unlocked: shouldUnlockImmediately 
    }, {
      onSuccess: () => { 
        notifySuccess();
      },
      onError: (err: any) => {
        logger.error(`Erro ao selecionar tipo de ponto: ${type}`, { error: err.message, routeId, catId }, err);
        toast.error(`Erro ao selecionar ${type}: ${err.message}`);
      },
    });
  };

  const handleUploadPhoto = async (submittedPhotos?: string[]) => {
    const effective = submittedPhotos && submittedPhotos.length ? submittedPhotos : photos;
    if (effective.length < min) return toast.error(`É necessário enviar pelo menos ${min} foto(s) ANTES.`);
    setIsSending(true);
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 5000 })
      ).catch(() => null);

      const body = {
        route_brand_id: routeBrandId, 
        photo_url: effective[0], 
        photos: effective,
        latitude: pos?.coords.latitude, 
        longitude: pos?.coords.longitude,
      };

      // Always use background queue for photo-related actions for performance
      queueApiCall({
        url: `/api/merch/promotor/routes/${routeId}/categories/${catId}/photo`,
        method: 'POST',
        body: { ...body, routeId, catId },
        headers: { 'Authorization': `Bearer ${localStorage.getItem('promotor_token') || localStorage.getItem('auth_token')}` },
        dependsOnUploadId: effective[0]?.startsWith('local-file://') ? effective[0].replace('local-file://', '') : undefined
      });
      
      setPhotos([]);
      setIsSending(false);
      onUnlocked();
    } catch {
      setIsSending(false);
    }
  };

  const handleAddPhoto = (url: string) => {
    setPhotos(prev => [...prev, url]);
  };

  const handleRemovePhoto = (index: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== index));
  };

  // Auto-set point type to 'natural' by default — extra points are added via the dedicated "Registrar Ponto Extra" flow
  useEffect(() => {
    if (!isUnlocked && !hasPointType && !setPointType.isPending) {
      handleSetPointType('natural');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPointType, isUnlocked]);

  if (isUnlocked) return null;

  return (
    <Card className="border-primary/40 bg-primary/5">
      <CardContent className="p-4 space-y-4">
        {/* Tabs Antes / Depois */}
        <div className="grid grid-cols-2 gap-1 p-1 bg-muted rounded-lg">
          <div className="text-center py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-semibold">
            📷 Foto Antes
          </div>
          <div className="text-center py-1.5 rounded-md text-xs font-medium text-muted-foreground/60 cursor-not-allowed flex items-center justify-center gap-1">
            <Lock className="h-3 w-3" /> Foto Depois
          </div>
        </div>

        {/* Bloco 1: Identification */}
        <div className="flex items-center gap-2 text-sm">
          <Target className="h-4 w-4 text-primary" />
          <div>
            <span className="font-bold">{categoryName}</span>
            <span className="text-muted-foreground ml-2">• {pdvName} • {brandName}</span>
          </div>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 text-[11px] flex-wrap">
          {photoMode !== 'after' && (
            <>
              <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full ${(hasPhoto || photos.length > 0) ? 'bg-green-500/20 text-green-700' : 'bg-yellow-500/20 text-yellow-700'}`}>
                {(hasPhoto || photos.length > 0) ? <CheckCircle2 className="h-3 w-3" /> : <span className="font-bold">1</span>}
                Foto{photoCount > 1 ? `s (${photoCount})` : ''}
              </div>
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
            </>
          )}
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
            <Lock className="h-3 w-3" />
            Produtos
          </div>
        </div>

        {/* Bloco 3: Photos (multiple) */}
        {!hasPhoto && photoMode !== 'after' && (
          <PhotoApprovalCapture
            photos={photos}
            onPhotosChange={setPhotos}
            min={min}
            allowExtras={min > 1}
            isSending={isSending}
            onSubmit={handleUploadPhoto}
            cameraProps={{
              watermark: { pdvName, brandName, promotorName, photoType: 'Categoria (antes)' },
              customTokenGetter: () => localStorage.getItem('promotor_token') || localStorage.getItem('auth_token'),
              qualityConfig,
              allowManualUpload: false,
            }}
            label="Foto da categoria (ANTES da execução)"
            submitLabel="Registrar e liberar produtos"
          />
        )}

        {/* Lock message */}
        <div className="flex items-center gap-2 p-2 rounded bg-destructive/10 text-destructive text-xs">
          <Lock className="h-4 w-4 flex-shrink-0" />
          <span>
            {photoMode === 'after'
              ? 'Liberando produtos...'
              : photos.length === 0 && !hasPhoto
                ? 'É necessário tirar a foto da categoria antes de acessar os produtos.'
                : 'Registre a(s) foto(s) para liberar os produtos.'}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

// ===== Extra Point Photo Gate (no point type, only photo) =====
function ExtraPointPhotoGate({ catId, routeBrandId, categoryName, routeId, pdvName, brandName, promotorName, qualityConfig, onPhotoTaken }: {
  catId: string; routeBrandId?: string; categoryName: string; routeId: string; pdvName: string; brandName: string; promotorName?: string; qualityConfig?: PhotoQualityConfig; onPhotoTaken: () => void;
}) {
  const [photos, setPhotos] = useState<string[]>([]);
  const [isSending, setIsSending] = useState(false);
  const { queueApiCall } = useOfflineSync();


  const handleUploadPhoto = async (submittedPhotos?: string[]) => {
    const effective = submittedPhotos && submittedPhotos.length ? submittedPhotos : photos;
    if (effective.length === 0) return toast.error('É necessário tirar pelo menos 1 foto do ponto extra.');
    setIsSending(true);
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 5000 })
      ).catch(() => null);

      const body = {
        photo_type: 'extra_point',
        category_id: catId,
        route_brand_id: routeBrandId,
        exposure_point: 'extra',
        photo_url: effective[0],
        latitude: pos?.coords.latitude, longitude: pos?.coords.longitude,
      };

      await queueApiCall({
        url: `/api/merch/promotor/routes/${routeId}/photos`,
        method: 'POST',
        body,
        headers: { 'Authorization': `Bearer ${localStorage.getItem('promotor_token') || localStorage.getItem('auth_token')}` },
        dependsOnUploadId: effective[0]?.startsWith('local-file://') ? effective[0].replace('local-file://', '') : undefined
      });
      
      setPhotos([]);
      setIsSending(false);
      onPhotoTaken();
    } catch { 
      setIsSending(false); 
    }
  };


  return (
    <Card className="border-orange-400/40 bg-orange-50/50">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center gap-2 text-sm">
          <Target className="h-4 w-4 text-orange-600" />
          <div>
            <span className="font-bold">{categoryName}</span>
            <span className="text-muted-foreground ml-2">• {pdvName} • {brandName}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-[11px]">
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/20 text-green-700">
            <CheckCircle2 className="h-3 w-3" /> Ponto Extra
          </div>
          <ChevronRight className="h-3 w-3 text-muted-foreground" />
          <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full ${photos.length > 0 ? 'bg-green-500/20 text-green-700' : 'bg-yellow-500/20 text-yellow-700'}`}>
            {photos.length > 0 ? <CheckCircle2 className="h-3 w-3" /> : <span className="font-bold">1</span>}
            Foto{photos.length > 1 ? `s (${photos.length})` : ''}
          </div>
          <ChevronRight className="h-3 w-3 text-muted-foreground" />
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
            <Lock className="h-3 w-3" /> Produtos
          </div>
        </div>

        <PhotoApprovalCapture
          photos={photos}
          onPhotosChange={setPhotos}
          min={1}
          allowExtras={false}
          isSending={isSending}
          onSubmit={handleUploadPhoto}
          cameraProps={{
            watermark: { pdvName, brandName, photoType: 'Ponto Extra' },
            customTokenGetter: () => localStorage.getItem('promotor_token') || localStorage.getItem('auth_token'),
            qualityConfig,
            allowManualUpload: false,
          }}
          label="Foto do Ponto Extra (obrigatória)"
          submitLabel="Confirmar e liberar produtos"
          accentColorClass="text-orange-700"
        />

        <div className="flex items-center gap-2 p-2 rounded-md bg-orange-100/50 text-orange-800 text-[11px]">
          <Camera className="h-4 w-4 flex-shrink-0" />
          <span>Tire a foto do ponto extra antes de acessar os produtos.</span>
        </div>
      </CardContent>
    </Card>
  );
}

// ===== Category After Photo Gate (required to close/complete category) =====
function CategoryAfterPhotoGate({ catId, routeBrandId, categoryName, routeId, pdvName, brandName, promotorName, qualityConfig, minPhotos, onCompleted }: {
  catId: string; routeBrandId?: string; categoryName: string; routeId: string; pdvName: string; brandName: string; promotorName?: string; qualityConfig?: PhotoQualityConfig; minPhotos: number; onCompleted: () => void;
}) {
  const setCategoryAfterPhoto = usePromotorCategoryAfterPhoto();
  const [photos, setPhotos] = useState<string[]>([]);
  const [isSending, setIsSending] = useState(false);
  const { isOnline, queueApiCall } = useOfflineSync();

  const min = Math.max(1, minPhotos || 1);

  const handleUpload = async (submittedPhotos?: string[]) => {
    const effective = submittedPhotos && submittedPhotos.length ? submittedPhotos : photos;
    if (effective.length < min) return toast.error(`É necessário enviar pelo menos ${min} foto(s) DEPOIS.`);
    setIsSending(true);
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 5000 })
      ).catch(() => null);

      const body = {
        routeId, catId, route_brand_id: routeBrandId, photo_url: effective[0], photos: effective,
        latitude: pos?.coords.latitude, longitude: pos?.coords.longitude,
      };

      await queueApiCall({
        url: `/api/merch/promotor/routes/${routeId}/categories/${catId}/after-photo`,
        method: 'POST',
        body,
        headers: { 'Authorization': `Bearer ${localStorage.getItem('promotor_token') || localStorage.getItem('auth_token')}` }
      });
      
      setPhotos([]);
      setIsSending(false);
      onCompleted();
    } catch { 
      setIsSending(false); 
    }
  };



  return (
    <Card className="border-green-500/40 bg-green-50/50 mt-2">
      <CardContent className="p-4 space-y-3">
        {/* Tabs Antes / Depois */}
        <div className="grid grid-cols-2 gap-1 p-1 bg-muted rounded-lg">
          <div className="text-center py-1.5 rounded-md text-xs font-medium text-green-700 flex items-center justify-center gap-1">
            <CheckCircle2 className="h-3 w-3" /> Foto Antes
          </div>
          <div className="text-center py-1.5 rounded-md bg-green-600 text-white text-xs font-semibold">
            📷 Foto Depois
          </div>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <Camera className="h-4 w-4 text-green-600" />
          <div>
            <span className="font-bold">{categoryName}</span>
            <Badge variant="secondary" className="ml-2 text-[9px] bg-green-100 text-green-700">Foto DEPOIS</Badge>
          </div>
        </div>

        <PhotoApprovalCapture
          photos={photos}
          onPhotosChange={setPhotos}
          min={min}
          allowExtras={min > 1}
          isSending={isSending || setCategoryAfterPhoto.isPending}
          onSubmit={handleUpload}
          cameraProps={{
            watermark: { pdvName, brandName, promotorName, photoType: 'Categoria (depois)' },
            customTokenGetter: () => localStorage.getItem('promotor_token') || localStorage.getItem('auth_token'),
            qualityConfig,
            allowManualUpload: false,
          }}
          label="Foto da categoria DEPOIS da execução"
          submitLabel="Registrar fotos e concluir categoria"
          accentColorClass="text-green-700"
        />

        <div className="flex items-center gap-2 p-2 rounded-md bg-green-100/50 text-green-800 text-[11px]">
          <Camera className="h-4 w-4 flex-shrink-0" />
          <span>Foto DEPOIS obrigatória para concluir esta categoria.</span>
        </div>
      </CardContent>
    </Card>
  );
}

// ===== Painel de fotos extras da categoria (visualizar + adicionar mais) =====
function CategoryExtraPhotosPanel({
  routeId, catId, routeBrandId, photos, hasAnyAfter, hasAnyBefore, completed,
  pdvName, brandName, promotorName, qualityConfig, onUploaded,
}: {
  routeId: string; catId: string; routeBrandId?: string;
  photos: any[]; hasAnyAfter: boolean; hasAnyBefore: boolean; completed: boolean;
  pdvName: string; brandName: string; promotorName?: string;
  qualityConfig?: PhotoQualityConfig;
  onUploaded: () => void;
}) {
  const { queueApiCall } = useOfflineSync();
  const [mode, setMode] = useState<'before' | 'after' | null>(null);
  const [newPhotos, setNewPhotos] = useState<string[]>([]);
  const [sending, setSending] = useState(false);

  const beforePhotos = photos.filter((p: any) => p.photo_type === 'category_before');
  const afterPhotos = photos.filter((p: any) => p.photo_type === 'category_after');

  // Regra: só pode adicionar mais ANTES se ainda NÃO começou fotos DEPOIS
  const canAddBefore = !hasAnyAfter;
  // Adicionar mais DEPOIS: sempre permitido (mesmo após 100%, o promotor pode
  // querer registrar fotos adicionais da execução)
  const canAddAfter = true;

  const handleRemove = (i: number) => setNewPhotos((prev) => prev.filter((_, idx) => idx !== i));

  const handleCapture = async (url: string) => {
    if (!mode) return;
    setNewPhotos((prev) => [...prev, url]);
    setSending(true);
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 5000 })
      ).catch(() => null);
      const endpoint = mode === 'before' ? 'photo' : 'after-photo';
      await queueApiCall({
        url: `/api/merch/promotor/routes/${routeId}/categories/${catId}/${endpoint}`,
        method: 'POST',
        body: {
          route_brand_id: routeBrandId,
          photo_url: url,
          photos: [url],
          latitude: pos?.coords.latitude,
          longitude: pos?.coords.longitude,
          routeId, catId,
        },
        headers: { 'Authorization': `Bearer ${localStorage.getItem('promotor_token') || localStorage.getItem('auth_token')}` },
      });
      toast.success('Foto adicionada');
      onUploaded();
    } catch {
      toast.error('Erro ao enviar foto');
    } finally {
      setSending(false);
    }
  };


  // Mescla as fotos confirmadas pelo servidor com as recém-tiradas (otimista)
  // evitando duplicar caso o refetch já tenha trazido a mesma URL.
  const serverBeforeUrls = new Set(beforePhotos.map((p: any) => p.photo_url));
  const serverAfterUrls = new Set(afterPhotos.map((p: any) => p.photo_url));
  const optimisticBefore = mode === 'before' ? newPhotos.filter((u) => !serverBeforeUrls.has(u)) : [];
  const optimisticAfter = mode === 'after' ? newPhotos.filter((u) => !serverAfterUrls.has(u)) : [];
  const totalBefore = beforePhotos.length + optimisticBefore.length;
  const totalAfter = afterPhotos.length + optimisticAfter.length;

  return (
    <div className="mt-2 p-3 rounded-lg border border-dashed border-muted-foreground/30 bg-muted/20 space-y-3">
      <div className="space-y-2">
        {totalBefore > 0 && (
          <div>
            <div className="text-[10px] font-semibold uppercase text-muted-foreground mb-1">📷 Antes ({totalBefore})</div>
            <div className="grid grid-cols-4 gap-1.5">
              {beforePhotos.map((p: any, i: number) => (
                <LocalImage key={p.id || `b-${i}`} src={p.photo_url} alt={`Antes ${i+1}`} className="w-full h-16 rounded border object-cover" />
              ))}
              {optimisticBefore.map((u, i) => (
                <LocalImage key={`ob-${i}`} src={u} alt={`Antes nova ${i+1}`} className="w-full h-16 rounded border border-primary/40 object-cover ring-1 ring-primary/30" />
              ))}
            </div>
          </div>
        )}
        {totalAfter > 0 && (
          <div>
            <div className="text-[10px] font-semibold uppercase text-green-700 mb-1">✅ Depois ({totalAfter})</div>
            <div className="grid grid-cols-4 gap-1.5">
              {afterPhotos.map((p: any, i: number) => (
                <LocalImage key={p.id || `a-${i}`} src={p.photo_url} alt={`Depois ${i+1}`} className="w-full h-16 rounded border border-green-500/40 object-cover" />
              ))}
              {optimisticAfter.map((u, i) => (
                <LocalImage key={`oa-${i}`} src={u} alt={`Depois nova ${i+1}`} className="w-full h-16 rounded border border-green-500/60 object-cover ring-1 ring-green-500/40" />
              ))}
            </div>
          </div>
        )}
        {totalBefore === 0 && totalAfter === 0 && (
          <p className="text-xs text-muted-foreground text-center">Nenhuma foto registrada ainda.</p>
        )}
      </div>

      {mode === null ? (
        <div className="flex flex-col gap-1.5">
          {canAddBefore && (
            <Button size="sm" variant="outline" onClick={() => setMode('before')} className="justify-start h-8">
              <ImagePlus className="h-3.5 w-3.5 mr-1.5" /> Adicionar mais fotos ANTES
            </Button>
          )}
          {canAddAfter && (
            <Button size="sm" variant="outline" onClick={() => setMode('after')} className="justify-start h-8 border-green-500/40 text-green-700 hover:bg-green-50">
              <ImagePlus className="h-3.5 w-3.5 mr-1.5" /> Adicionar mais fotos DEPOIS
            </Button>
          )}
          {!canAddBefore && hasAnyAfter && (
            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Lock className="h-3 w-3" /> Não é possível adicionar fotos ANTES após iniciar as fotos DEPOIS.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold">
              Adicionando {mode === 'before' ? 'ANTES' : 'DEPOIS'}
            </Label>
            <Button size="sm" variant="ghost" onClick={() => { setMode(null); setNewPhotos([]); }} disabled={sending} className="h-7 text-[11px]">Concluir</Button>
          </div>
          <CameraCapture
            watermark={{ pdvName, brandName, promotorName, photoType: mode === 'before' ? 'Categoria (antes - extra)' : 'Categoria (depois - extra)' }}
            customTokenGetter={() => localStorage.getItem('promotor_token') || localStorage.getItem('auth_token')}
            qualityConfig={qualityConfig}
            allowManualUpload={false}
            autoOpen={newPhotos.length === 0}
            onCapture={handleCapture}
            disabled={sending}
            buttonLabel={sending ? 'Enviando...' : (newPhotos.length === 0 ? 'Tirar foto' : `Tirar outra foto`)}
          />
        </div>

      )}
    </div>
  );
}

export default function PromotorRota() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: route, isLoading, refetch, error: routeError } = usePromotorRouteDetail(id);
  const checkin = usePromotorCheckin();
  const checkout = usePromotorCheckout();
  const updateExec = usePromotorUpdateExecution();
  const { isOnline, isSyncing, queueApiCall } = useOfflineSync();
  const reportDamage = usePromotorReportDamage();
  const reportRupture = usePromotorReportRupture();
  const addValidity = usePromotorAddValidity();
  const reportDiscard = usePromotorReportDiscard();
  const pdvCheckout = usePromotorPdvCheckout();
  const registerExtraPoint = usePromotorRegisterExtraPoint();
  const [photoQualityConfig, setPhotoQualityConfig] = useState<PhotoQualityConfig | undefined>();
  const [activeBrandId, setActiveBrandId] = useState<string | null>(null);

  const [activeAction, setActiveAction] = useState<ActionType>(null);
  const [selectedExec, setSelectedExec] = useState<any>(null);
  const [actionForm, setActionForm] = useState<any>({});
  const [showCompleteRoute, setShowCompleteRoute] = useState(false);
  const [showPdvCheckout, setShowPdvCheckout] = useState(false);
  const [pdvCheckoutPhoto, setPdvCheckoutPhoto] = useState('');
  const [checkinPhotoUrl, setCheckinPhotoUrl] = useState('');
  const [checkinSubmitted, setCheckinSubmitted] = useState(false);


  // Load photo quality config
  useEffect(() => {
    api<any>('/api/merchandising/photo-quality-config')
      .then(d => { if (d?.config) setPhotoQualityConfig(d.config); })
      .catch(() => { /* use defaults */ });
  }, []);

  const [routeCompletionResult, setRouteCompletionResult] = useState<any>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showExtraPointDialog, setShowExtraPointDialog] = useState<{ catId: string; categoryName: string } | null>(null);
  const [selectedExtraProducts, setSelectedExtraProducts] = useState<string[]>([]);
  const [showExtraPointCategoryPicker, setShowExtraPointCategoryPicker] = useState(false);
  const [extraGroupPhotos, setExtraGroupPhotos] = useState<Record<string, boolean>>({});
  const [optimisticBeforeUnlock, setOptimisticBeforeUnlock] = useState<Record<string, boolean>>({});
  const [optimisticAfterPhoto, setOptimisticAfterPhoto] = useState<Record<string, boolean>>({});

  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const [extraPhotosOpen, setExtraPhotosOpen] = useState<Record<string, boolean>>({});
  const [showFaceVerify, setShowFaceVerify] = useState(false);
  const [faceVerifyAction, setFaceVerifyAction] = useState<'checkin' | 'checkout' | 'pdv_checkout' | null>(null);

  // Facial config
  const promotorToken = localStorage.getItem('promotor_token') || localStorage.getItem('auth_token');
  const { data: facialConfig } = useQuery({
    queryKey: ['promotor-facial-config'],
    queryFn: async () => {
      try {
        return await api<any>('/api/promotor/facial-config');
      } catch (err) {
        return null;
      }
    },
    retry: false,
    staleTime: 300000,
  });
  const isFacialActiveCheckin = facialConfig?.enabled && 
    facialConfig?.use_for_checkin && 
    facialConfig?.has_enrollment && 
    facialConfig?.verification_enabled !== false;

  // Multi-brand support
  const isMultiBrand = route?.is_multi_brand && route?.route_brands?.length > 1;
  const routeBrands = route?.route_brands || [];
  const currentBrand = useMemo(() => routeBrands.find((rb: any) => rb.brand_id === activeBrandId), [routeBrands, activeBrandId]);

  useEffect(() => {
    if (routeError) {
      logger.error('Erro ao carregar rota', { routeId: id, error: routeError });
      toast.error('Rota não encontrada ou erro ao carregar.');
      navigate('/promotor/home');
    }
  }, [routeError, id, navigate]);

  useEffect(() => {
    if (route && !isMultiBrand && !activeBrandId) {
      setActiveBrandId(route.brand_id);
    }
  }, [route, isMultiBrand, activeBrandId]);

  // Timer to keep current time updated for min duration check
  useEffect(() => {
    if (route?.status === 'in_progress') {
      const timer = setInterval(() => setCurrentTime(new Date()), 10000);
      return () => clearInterval(timer);
    }
  }, [route?.status]);

  // Build category status map - filter by active brand if multi-brand
  const categoryStatusMap = useMemo(() => {
    const map: Record<string, any> = {};
    (route?.category_statuses || []).forEach((cs: any) => {
      // Create keys for both specific (with brand) and general category access
      const key = cs.route_brand_id ? `${cs.category_id}_${cs.route_brand_id}` : cs.category_id;
      map[key] = cs;
    });
    return map;
  }, [route?.category_statuses]);

  const requireStockCount = useMemo(() => (isMultiBrand ? currentBrand?.require_stock_count : route?.require_stock_count) ?? false, [isMultiBrand, currentBrand, route]);
  const requireValidityCheck = useMemo(() => (isMultiBrand ? currentBrand?.require_validity_check : route?.require_validity_check) ?? false, [isMultiBrand, currentBrand, route]);
  const canQuickCheck = !requireStockCount && !requireValidityCheck;

  // Stock count executions (Contagem de Saldo) for this route
  const { data: stockCountExecs = [] } = useRouteStockCount(id);
  const stockCountBlocking = useMemo(() => {
    return (stockCountExecs as any[]).filter((e: any) =>
      e?.rule?.block_route_completion &&
      e.status !== 'completed' && e.status !== 'justified'
    );
  }, [stockCountExecs]);




  // Filter executions by active brand
  const filteredExecs = useMemo(() => {
    if (!route?.executions) return [];
    if (!isMultiBrand || !activeBrandId) return route.executions;
    return route.executions.filter((e: any) => {
      if (e.route_brand_id) {
        const rb = routeBrands.find((b: any) => b.id === e.route_brand_id);
        return rb?.brand_id === activeBrandId;
      }
      return e.brand_id === activeBrandId;
    });
  }, [route?.executions, isMultiBrand, activeBrandId, routeBrands]);

  const groupedExecs = useMemo(() => {
    const groups: Record<string, { catId: string; execs: any[]; isExtraGroup?: boolean }> = {};
    filteredExecs.forEach((e: any) => {
      const baseCat = e.category_name || 'Sem Categoria';
      if (e.exposure_point === 'extra') {
        const extraKey = `${baseCat} (Ponto Extra)`;
        if (!groups[extraKey]) groups[extraKey] = { catId: e.category_id, execs: [], isExtraGroup: true };
        groups[extraKey].execs.push(e);
      } else {
        if (!groups[baseCat]) groups[baseCat] = { catId: e.category_id, execs: [] };
        groups[baseCat].execs.push(e);
      }
    });
    return groups;
  }, [filteredExecs]);

  const productsWithExtraPoint = useMemo(() => {
    const set = new Set<string>();
    route?.executions?.forEach((e: any) => {
      if (e.exposure_point === 'extra') {
        set.add(`${e.category_id}_${e.product_id}`);
      }
    });
    return set;
  }, [route?.executions]);

  const persistedExtraPointPhotoKeys = useMemo(() => {
    const set = new Set<string>();
    route?.photos?.forEach((photo: any) => {
      const isExtraPointPhoto = photo.photo_type === 'extra_point' || photo.exposure_point === 'extra';
      if (!isExtraPointPhoto) return;
      set.add(`extra_${photo.category_id || 'null'}_${photo.route_brand_id || 'null'}`);
    });
    return set;
  }, [route?.photos]);

  // Photo-only mode: auto-complete pending products ONLY after the required
  // category photos (before/after according to checklist) have been registered.
  // This keeps progress tied to actual photos taken.
  useEffect(() => {
    if (!route?.executions?.length) return;
    Object.values(groupedExecs).forEach(({ catId, execs, isExtraGroup }) => {
      const routeBrandId = execs[0]?.route_brand_id;
      const categoryKey = `${catId}_${routeBrandId || 'null'}`;
      const catStatus = categoryStatusMap[categoryKey] || categoryStatusMap[catId];
      const rbConfig = isMultiBrand ? routeBrands.find((b: any) => b.id === routeBrandId) : null;
      const source = rbConfig || (route as any);
      // Per-brand (ou rota): se contagem OU validade são exigidas, NÃO auto-completa.
      // Progresso tem que ser produto a produto via formulário do produto.
      const brandRequiresStock = !!source?.require_stock_count;
      const brandRequiresValidity = !!source?.require_validity_check;
      // Extra-point groups don't collect stock/validity — they are photo-only,
      // so the stock/validity guard should NOT block their auto-completion
      // (otherwise the route can never be concluded when a ponto extra is registered).
      if (!isExtraGroup && (brandRequiresStock || brandRequiresValidity)) return;

      const requireCategoryPhotos = source?.require_category_photos !== false;
      const photoMode = source?.category_photo_mode || 'both';

      let photosSatisfied = false;
      if (isExtraGroup) {
        const extraKey = `extra_${catId || 'null'}_${execs[0]?.route_brand_id || 'null'}`;
        photosSatisfied = !!extraGroupPhotos[extraKey] || persistedExtraPointPhotoKeys.has(extraKey);
      } else if (!requireCategoryPhotos) {
        photosSatisfied = true;
      } else {
        const hasBefore = !!catStatus?.category_before_photo;
        const hasAfter = !!catStatus?.category_after_photo || !!optimisticAfterPhoto[categoryKey];
        if (photoMode === 'before') photosSatisfied = hasBefore;
        else if (photoMode === 'after') photosSatisfied = hasAfter;
        else photosSatisfied = hasBefore && hasAfter;
      }
      if (!photosSatisfied) return;

      execs.forEach((exec: any) => {
        if (exec.status !== 'completed' && !exec.has_rupture && !exec.has_damage) {
          updateExec.mutate({
            id: exec.id,
            status: 'completed',
            checked: true,
            qty_store: 0,
            qty_stock: 0,
          });
        }
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupedExecs, categoryStatusMap, extraGroupPhotos, persistedExtraPointPhotoKeys, optimisticAfterPhoto, isMultiBrand, routeBrands, route]);

  const handleCheckin = useCallback(async (photoOverride?: string) => {
    const effectivePhotoUrl = photoOverride || checkinPhotoUrl;
    if (!id) return;
    
    // Guarda contra múltiplos cliques (queueApiCall não expõe isPending)
    if ((handleCheckin as any)._running || checkinSubmitted) {
      logger.warn('[handleCheckin] Check-in já em andamento, ignorando duplicado');
      return;
    }
    (handleCheckin as any)._running = true;
    
    // Check if route is already in progress or completed
    if (route?.status === 'in_progress' || route?.status === 'completed') {
      (handleCheckin as any)._running = false;
      logger.warn('[handleCheckin] Rota já em andamento ou concluída, ignorando check-in duplicado', { 
        status: route?.status, 
        routeId: id 
      });
      return;
    }

    if (route?.require_checkin_photo && !effectivePhotoUrl) {
      (handleCheckin as any)._running = false;
      toast.error('Esta rota exige foto obrigatória no check-in');
      return;
    }
    if (isFacialActiveCheckin && faceVerifyAction !== 'checkin') {
      (handleCheckin as any)._running = false;
      setFaceVerifyAction('checkin');
      setShowFaceVerify(true);
      return;
    }
    setFaceVerifyAction(null);
    try {
      logger.info('[handleCheckin] Iniciando check-in da rota', { routeId: id, pdvName: route?.pdv_name });
      
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        if (!navigator.geolocation) {
          reject(new Error('GPS não suportado pelo seu navegador.'));
          return;
        }
        navigator.geolocation.getCurrentPosition(resolve, reject, { 
          enableHighAccuracy: true, 
          timeout: 10000,
          maximumAge: 0
        });
      }).catch(err => {
        logger.error('[handleCheckin] Erro de GPS no check-in', { err, routeId: id });
        if (err.code === 1) throw new Error('Permissão de GPS negada. Por favor, autorize o acesso à localização.');
        if (err.code === 2) throw new Error('Posição indisponível. Verifique se o GPS está ativado.');
        if (err.code === 3) throw new Error('Tempo limite do GPS esgotado. Tente novamente em um local mais aberto.');
        return null; // Don't block if GPS fails (especially offline)
      });

      logger.info('[handleCheckin] Localização obtida para check-in', { 
        routeId: id, 
        lat: pos?.coords.latitude, 
        lng: pos?.coords.longitude,
        accuracy: pos?.coords.accuracy 
      });

      const body = {
        id,
        latitude: pos?.coords.latitude,
        longitude: pos?.coords.longitude,
        device: navigator.userAgent || 'Unknown Device',
        photo_url: effectivePhotoUrl || undefined,
        facial_verified: isFacialActiveCheckin || undefined,
        all_routes_at_pdv: true,
      };

      // Always use background queue for check-in for performance
      await queueApiCall({
        url: `/api/merch/promotor/routes/${id}/checkin`,
        method: 'POST',
        body,
        headers: { 'Authorization': `Bearer ${localStorage.getItem('promotor_token') || localStorage.getItem('auth_token')}` },
        dependsOnUploadId: effectivePhotoUrl?.startsWith('local-file://') ? effectivePhotoUrl.replace('local-file://', '') : undefined
      });
      // Removed toast per user request

      // Otimista: libera a UI imediatamente para o promotor seguir o trabalho
      // sem esperar o refetch (a chamada de check-in é processada em background).
      setCheckinSubmitted(true);
      // We still want to refetch the route data to show updated status, 
      // but we do it immediately without waiting for the checkin call to finish.
      // The backend check-in usually takes care of the status.
      setTimeout(() => refetch(), 1000); 
    } catch (err: any) {
      (handleCheckin as any)._running = false;
      logger.error('[handleCheckin] Erro fatal no check-in', { message: err.message, routeId: id }, err);
      toast.error(err.message || 'Não foi possível realizar o check-in');
    }
  }, [id, checkin, route?.require_checkin_photo, route?.status, checkinPhotoUrl, isFacialActiveCheckin, faceVerifyAction, route?.pdv_name, isOnline, queueApiCall, refetch, checkinSubmitted]);

  const handleCompleteRoute = useCallback(async () => {
    if (!id) return;
    if (isFacialActiveCheckin && faceVerifyAction !== 'checkout') {
      setFaceVerifyAction('checkout');
      setShowFaceVerify(true);
      return;
    }
    setFaceVerifyAction(null);

    await queueApiCall({
      url: `/api/merch/promotor/routes/${id}/checkout`,
      method: 'POST',
      body: { notes: actionForm.notes },
      headers: { 'Authorization': `Bearer ${localStorage.getItem('promotor_token') || localStorage.getItem('auth_token')}` }
    });
    
    setShowCompleteRoute(false);
    navigate('/promotor/home');

  }, [id, checkout, actionForm, navigate, isFacialActiveCheckin, faceVerifyAction, isOnline, queueApiCall]);

  const handlePdvCheckout = useCallback(async () => {
    if (!route?.pdv_id) return;
    if (isFacialActiveCheckin && faceVerifyAction !== 'pdv_checkout') {
      setFaceVerifyAction('pdv_checkout');
      setShowFaceVerify(true);
      return;
    }
    setFaceVerifyAction(null);
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000 })
      ).catch(() => null);

      const body = {
        pdv_id: route.pdv_id,
        latitude: pos?.coords.latitude,
        longitude: pos?.coords.longitude,
        photo_url: pdvCheckoutPhoto || undefined,
        status_override: !pdvCheckoutPhoto ? 'awaiting_photo' : 'completed',
        notes: actionForm.pdv_notes,
      };

      // Always use background queue for PDV checkout for performance
      await queueApiCall({
        url: '/api/merch/promotor/pdv-checkout',
        method: 'POST',
        body,
        headers: { 'Authorization': `Bearer ${localStorage.getItem('promotor_token') || localStorage.getItem('auth_token')}` },
        dependsOnUploadId: pdvCheckoutPhoto.startsWith('local-file://') ? pdvCheckoutPhoto.replace('local-file://', '') : undefined
      });
      // Removed toast per user request

      setShowPdvCheckout(false);
      navigate('/promotor/home');
    } catch (err: any) {
      toast.error(err.message || 'Erro no checkout do PDV');
    }
  }, [route?.pdv_id, pdvCheckout, pdvCheckoutPhoto, actionForm, navigate, isOnline, queueApiCall]);

  const handleOpenProduct = useCallback((exec: any) => {
    const routeBrandId = exec.route_brand_id;
    const categoryKey = `${exec.category_id}_${routeBrandId || 'null'}`;
    const catStatus = categoryStatusMap[categoryKey] || categoryStatusMap[exec.category_id];
    
    // Check checklist settings for this brand
    const rb = isMultiBrand ? routeBrands.find((b: any) => b.id === routeBrandId) : null;
    const requireCategoryPhotos = (rb || route as any)?.require_category_photos !== false;
    const photoMode = (rb || route as any)?.category_photo_mode || 'both';
    const hasCategoryAccess = !!catStatus?.products_unlocked || !!catStatus?.category_before_photo || !!optimisticBeforeUnlock[categoryKey] || (photoMode === 'after' && !!catStatus?.point_type);
    
    if (requireCategoryPhotos && !hasCategoryAccess) {
      toast.error('Finalize a etapa de preparação da categoria antes de executar produtos.');
      return;
    }
    setSelectedExec(exec);
    setActionForm({
      qty_store: exec.qty_store || 0,
      qty_stock: exec.qty_stock || 0,
      expiry_date: exec.nearest_expiry_date ? String(exec.nearest_expiry_date).slice(0, 10) : '',
      val_qty_store: exec.nearest_expiry_qty_store ?? 0,
      val_qty_stock: exec.nearest_expiry_qty_stock ?? 0,
      product_observation: exec.observation ?? '',
    });
    setActiveAction(null);
  }, [categoryStatusMap, optimisticBeforeUnlock]);

  if (isLoading) return <PromotorLayout><div className="flex items-center justify-center h-64"><div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" /></div></PromotorLayout>;
  if (!route) return <PromotorLayout><div className="text-center py-12 text-muted-foreground">Rota não encontrada</div></PromotorLayout>;

  const needsCheckin = (route.status === 'scheduled' || route.status === 'confirmed') && !checkinSubmitted;
  const isActive = route.status === 'in_progress' || (checkinSubmitted && (route.status === 'scheduled' || route.status === 'confirmed'));
  const isCompleted = route.status === 'completed';

  // Multi-brand: show brand selection screen after check-in
  const showBrandSelector = isMultiBrand && isActive && !activeBrandId;

  const categoriesBlock = (isActive && (!isMultiBrand || activeBrandId)) ? (
          <div className="space-y-4">
            {activeBrandId && route?.pdv_id && (
              <StockCountCard
                routeId={id!}
                brandId={activeBrandId}
                brandName={currentBrand?.brand_name || route.brand_name}
                pdvId={route.pdv_id}
                promoterId={route.promotor_id || route.employee_id}
              />
            )}
            {Object.entries(groupedExecs).map(([category, { catId, execs, isExtraGroup }]) => {
              const routeBrandId = execs[0]?.route_brand_id;
              const categoryKey = `${catId}_${routeBrandId || 'null'}`;
              const catStatus = categoryStatusMap[categoryKey] || categoryStatusMap[catId];
              
              // Use checklist settings if available
              const rb = isMultiBrand ? routeBrands.find((b: any) => b.brand_id === activeBrandId) : null;
              const photoMode = (rb || route as any)?.category_photo_mode || 'both';
              const requireCategoryPhotos = (rb || route as any)?.require_category_photos !== false;
              
              const extraPhotoKey = `extra_${catId || 'null'}_${routeBrandId || 'null'}`;
              const hasExtraPhoto = !!extraGroupPhotos[extraPhotoKey] || persistedExtraPointPhotoKeys.has(extraPhotoKey);
              
              // Unlocked depends on photoMode:
              // if 'after', products_unlocked comes from point-type selection
              // if 'before' or 'both', products_unlocked comes from before-photo upload
              const anyExecDone = execs.some((e: any) => e.status !== 'pending');
              const hasBeforeUnlock = !!catStatus?.products_unlocked || !!catStatus?.category_before_photo || !!optimisticBeforeUnlock[categoryKey];
              const isLocked = requireCategoryPhotos 
                ? (isExtraGroup ? (!hasExtraPhoto && !anyExecDone) : !hasBeforeUnlock) 
                : false;
                
              // Se o modo for "Só Depois" e já tiver selecionado o tipo de ponto, liberamos os produtos mesmo se o backend ainda não marcou products_unlocked
              const effectivelyLocked = isLocked && !(photoMode === 'after' && catStatus?.point_type);
                
              const doneCount = execs.filter((e: any) => e.status === 'completed').length;
              const allProductsDone = doneCount === execs.length && execs.length > 0;
              const afterPhotoKey = `${catId}_${routeBrandId || 'null'}`;
              const hasAfterPhoto = !!catStatus?.category_after_photo || !!catStatus?.completed || !!optimisticAfterPhoto[afterPhotoKey];
              const accordionKey = categoryKey;
              const isCompletedCategory = hasAfterPhoto;
              
              const photoOnlyMode = !requireStockCount && !requireValidityCheck;
              const readyForAfterPhoto = allProductsDone || (photoOnlyMode && photoMode === 'after' && !effectivelyLocked);

              // Show after photo gate when products are done OR photo-only checklist asks only after-photo
              const needsAfterPhoto = requireCategoryPhotos && 
                readyForAfterPhoto && 
                !effectivelyLocked && 
                !hasAfterPhoto && 
                (photoMode === 'both' || photoMode === 'after');


              // Visual state: active = unlocked & not completed; locked = needs photo; done = after photo taken
              const isActiveCategory = !effectivelyLocked && !isCompletedCategory && (isExtraGroup ? hasExtraPhoto : hasBeforeUnlock);
              const wrapperClass = isCompletedCategory
                ? 'border-green-500/30 bg-green-500/5'
                : isActiveCategory
                  ? 'border-primary ring-2 ring-primary/40 bg-primary/5 shadow-md shadow-primary/10'
                  : effectivelyLocked
                    ? 'border-dashed border-muted-foreground/30 bg-muted/30 opacity-70'
                    : 'border-border bg-card';

              return (

                <div key={category} className={`rounded-xl border p-3 transition-all ${wrapperClass}`}>
                  {isActiveCategory && (
                    <div className="flex items-center gap-1.5 mb-2 text-[10px] font-bold uppercase tracking-wider text-primary">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                      Categoria em andamento
                    </div>
                  )}
                  {/* Category preparation for normal groups */}
                  {effectivelyLocked && !isExtraGroup && (
                    <CategoryPreparation
                      category={catStatus}
                      catId={catId}
                      routeBrandId={routeBrandId}
                      categoryName={category}
                      routeId={id!}
                      pdvName={route.pdv_name}
                      brandName={currentBrand?.brand_name || route.brand_name}
                      promotorName={route.promotor_name}
                      qualityConfig={photoQualityConfig}
                      photoMode={photoMode}
                      minPhotos={Math.max(1, parseInt((rb || route as any)?.min_category_photos_before, 10) || 1)}
                      onUnlocked={() => { setOptimisticBeforeUnlock(prev => ({ ...prev, [categoryKey]: true })); refetch(); }}
                      onPointTypeSet={() => { refetch(); }}
                    />
                  )}

                  {/* Extra group: only needs photo, no point type */}
                  {isExtraGroup && !hasExtraPhoto && (
                    <ExtraPointPhotoGate
                      catId={catId}
                      routeBrandId={routeBrandId}
                      categoryName={category}
                      routeId={id!}
                      pdvName={route.pdv_name}
                      brandName={currentBrand?.brand_name || route.brand_name}
                      promotorName={route.promotor_name}
                      qualityConfig={photoQualityConfig}
                      onPhotoTaken={() => setExtraGroupPhotos(prev => ({ ...prev, [extraPhotoKey]: true }))}
                    />
                  )}

                  {/* Category header */}
                  <div
                    className={`flex items-center justify-between mb-2 rounded-md px-2 py-1.5 transition-colors ${isCompletedCategory ? 'cursor-pointer' : ''}`}
                    onClick={isCompletedCategory ? () => setExpandedCategories(prev => ({ ...prev, [accordionKey]: !prev[accordionKey] })) : undefined}
                  >
                    <div className="flex items-center gap-2">
                      {hasAfterPhoto ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : isExtraGroup ? <Target className="h-4 w-4 text-orange-600" /> : (requireCategoryPhotos && effectivelyLocked) ? <Lock className="h-4 w-4 text-muted-foreground" /> : <Unlock className="h-4 w-4 text-primary" />}
                      <h3 className={`text-sm font-bold ${isActiveCategory ? 'text-primary' : ''}`}>{category}</h3>
                      {hasAfterPhoto && (
                        <Badge variant="secondary" className="text-[9px] bg-green-100 text-green-700">✅ OK</Badge>
                      )}
                      {isExtraGroup && !hasAfterPhoto ? (
                        <Badge variant="secondary" className="text-[9px] bg-orange-100 text-orange-700 border-orange-300">🎯 Extra</Badge>
                      ) : !hasAfterPhoto && catStatus?.point_type && (
                        <Badge variant="outline" className="text-[9px]">
                          {catStatus.point_type === 'natural' ? '📍 Natural' : '🎯 Extra'}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {hasBeforeUnlock && !isExtraGroup && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-[10px]"
                          onClick={(e) => { e.stopPropagation(); setExtraPhotosOpen(prev => ({ ...prev, [accordionKey]: !prev[accordionKey] })); }}
                          title="Ver fotos / adicionar mais"
                        >
                          <Camera className="h-3.5 w-3.5 mr-1" />
                          Fotos
                        </Button>
                      )}
                      <Badge variant={isActiveCategory ? 'default' : 'outline'} className="text-[10px]">{doneCount}/{execs.length}</Badge>
                      {isCompletedCategory && (expandedCategories[accordionKey] ? <ChevronUp className="h-4 w-4 text-green-700" /> : <ChevronDown className="h-4 w-4 text-green-700" />)}
                    </div>
                  </div>

                  {/* Painel de fotos extras da categoria */}
                  {extraPhotosOpen[accordionKey] && hasBeforeUnlock && !isExtraGroup && (
                    <CategoryExtraPhotosPanel
                      routeId={id!}
                      catId={catId}
                      routeBrandId={routeBrandId}
                      photos={(route?.photos || []).filter((p: any) => (p.category_id || null) === (catId || null) && (p.photo_type === 'category_before' || p.photo_type === 'category_after'))}
                      hasAnyBefore={!!catStatus?.category_before_photo || (route?.photos || []).some((p: any) => (p.category_id || null) === (catId || null) && p.photo_type === 'category_before')}
                      hasAnyAfter={!!catStatus?.category_after_photo || (route?.photos || []).some((p: any) => (p.category_id || null) === (catId || null) && p.photo_type === 'category_after')}
                      completed={isCompletedCategory}
                      pdvName={route.pdv_name}
                      brandName={currentBrand?.brand_name || route.brand_name}
                      promotorName={route.promotor_name}
                      qualityConfig={photoQualityConfig}
                      onUploaded={() => refetch()}
                    />
                  )}

                  {/* Photo-only mode: collapse products into accordion (only matters when stock/validity counting is OFF) */}
                  {(() => {
                    const photoOnlyMode = !requireStockCount && !requireValidityCheck;
                    const isExpanded = isCompletedCategory ? !!expandedCategories[accordionKey] : photoOnlyMode ? !!expandedCategories[accordionKey] : true;
                    const showProducts = isCompletedCategory ? isExpanded : (!photoOnlyMode || isExpanded);
                    return (
                      <>
                        {photoOnlyMode && !isCompletedCategory && !effectivelyLocked && (
                          <button
                            type="button"
                            onClick={() => setExpandedCategories(prev => ({ ...prev, [accordionKey]: !prev[accordionKey] }))}
                            className="w-full flex items-center justify-between gap-2 text-[11px] text-muted-foreground py-1.5 px-2 rounded hover:bg-muted/50 border border-dashed border-muted-foreground/20 mb-1.5"
                          >
                            <span className="flex items-center gap-1.5">
                              <Package className="h-3 w-3" />
                              {isExpanded ? 'Ocultar produtos' : `Ver ${execs.length} produto(s) para registrar avaria/ruptura/validade`}
                            </span>
                            {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          </button>
                        )}

                        {showProducts && (
                          <div className={`space-y-1.5 ${effectivelyLocked ? 'opacity-40 pointer-events-none select-none' : ''}`}>
                            {execs.map((exec: any) => (
                              <Card key={exec.id} className={`transition-colors hover:border-primary/40 ${exec.status === 'completed' ? 'border-green-500/30 bg-green-500/5' : ''}`}>
                                <CardContent className="p-3">
                                  <div className="flex items-center gap-3">
                                    <div className="flex-shrink-0 cursor-pointer" onClick={() => {
                                      if (canQuickCheck) {
                                        updateExec.mutate({
                                          id: exec.id,
                                          status: exec.status === 'completed' ? 'pending' : 'completed',
                                          checked: exec.status !== 'completed',
                                          qty_store: 0,
                                          qty_stock: 0
                                        }, {
                                          onSuccess: () => { /* toast removed */ },
                                          onError: (err: any) => toast.error(err.message)
                                        });
                                      } else {
                                        handleOpenProduct(exec);
                                      }
                                    }}>
                                      {EXEC_STATUS_ICON[exec.status] || EXEC_STATUS_ICON.pending}
                                    </div>
                                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => handleOpenProduct(exec)}>
                                      <div className="text-sm font-medium truncate">{exec.product_name}</div>
                                      {exec.exposure_point !== 'natural' && <Badge variant="secondary" className="text-[9px] mt-0.5">{exec.exposure_point}</Badge>}
                                      {requireStockCount && (exec.qty_store > 0 || exec.qty_stock > 0) && (
                                        <div className="text-[10px] text-muted-foreground mt-0.5">
                                          Loja: {exec.qty_store} | Estoque: {exec.qty_stock} | Total: {exec.qty_total}
                                        </div>
                                      )}
                                      {requireValidityCheck && exec.nearest_expiry_date && (
                                        <div className="text-[10px] text-blue-600 mt-0.5 flex items-center gap-1">
                                          <CalendarIcon className="h-2.5 w-2.5" /> Val: {new Date(exec.nearest_expiry_date).toLocaleDateString('pt-BR')}
                                        </div>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-1.5 cursor-pointer" onClick={() => handleOpenProduct(exec)}>
                                      {exec.has_rupture && <AlertTriangle className="h-3.5 w-3.5 text-red-500" />}
                                      {exec.has_damage && <Archive className="h-3.5 w-3.5 text-orange-500" />}
                                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                        )}
                      </>
                    );
                  })()}

                  {/* After Photo Gate - shown when all products done but category not yet completed */}
                  {needsAfterPhoto && (
                    <CategoryAfterPhotoGate
                      catId={catId}
                      routeBrandId={routeBrandId}
                      categoryName={category}
                      routeId={id!}
                      pdvName={route.pdv_name}
                      brandName={currentBrand?.brand_name || route.brand_name}
                      promotorName={route.promotor_name}
                      qualityConfig={photoQualityConfig}
                      minPhotos={Math.max(1, parseInt((rb || route as any)?.min_category_photos_after, 10) || 1)}
                      onCompleted={() => { setOptimisticAfterPhoto(p => ({ ...p, [afterPhotoKey]: true })); refetch(); }}
                    />
                  )}
                </div>
              );
            })}

            {/* Complete Route button */}
            {(() => {
              // Para rotas multi-marcas, a conclusão global deve checar TODOS os produtos de TODAS as marcas
              const allExecutions = route?.executions || [];
              const totalExecsGlobal = allExecutions.length;
              const completedExecsGlobal = allExecutions.filter((e: any) => e.status === 'completed').length;
              const allProductsDoneGlobal = totalExecsGlobal > 0 && completedExecsGlobal === totalExecsGlobal;
              
              // Verificação global de fotos de categoria (DEPOIS) em todas as marcas/categorias
              const allExecutionsGroupedGlobal = allExecutions.reduce((acc: any, e: any) => {
                const key = e.route_brand_id ? `${e.category_id}_${e.route_brand_id}` : e.category_id;
                if (!acc[key]) acc[key] = { catId: e.category_id, routeBrandId: e.route_brand_id, execs: [] };
                acc[key].execs.push(e);
                return acc;
              }, {});

              const globalMissingBeforePhotos = Object.entries(allExecutionsGroupedGlobal).filter(([key, data]: [string, any]) => {
                const { catId, routeBrandId, execs } = data;
                const catStatus = categoryStatusMap[key] || categoryStatusMap[catId];
                const rbConfig = isMultiBrand ? routeBrands.find((b: any) => b.id === routeBrandId) : null;
                const reqPhotos = (rbConfig || route as any)?.require_category_photos !== false;
                const pMode = (rbConfig || route as any)?.category_photo_mode || 'both';
                const needsBefore = reqPhotos && (pMode === 'both' || pMode === 'before');
                if (!needsBefore) return false;
                // Ponto extra usa foto do próprio ponto, não a foto de categoria "antes"
                const isExtra = execs.every((e: any) => e.exposure_point === 'extra');
                if (isExtra) return false;
                const hasBeforePhotoInRoute = (route?.photos || []).some((p: any) => (p.category_id || null) === (catId || null) && (!routeBrandId || (p.route_brand_id || null) === routeBrandId) && p.photo_type === 'category_before');
                const hasBefore = !!catStatus?.category_before_photo || !!catStatus?.products_unlocked || hasBeforePhotoInRoute || !!optimisticBeforeUnlock[`${catId}_${routeBrandId || 'null'}`];
                return !hasBefore;
              });

              const globalMissingAfterPhotos = Object.entries(allExecutionsGroupedGlobal).filter(([key, data]: [string, any]) => {
                const { catId, routeBrandId, execs } = data;
                const catStatus = categoryStatusMap[key] || categoryStatusMap[catId];
                const allDone = execs.every((e: any) => e.status === 'completed');
                
                // Busca as configurações da marca para esta categoria
                const rbConfig = isMultiBrand ? routeBrands.find((b: any) => b.id === routeBrandId) : null;
                const reqPhotos = (rbConfig || route as any)?.require_category_photos !== false;
                const pMode = (rbConfig || route as any)?.category_photo_mode || 'both';
                
                const needsAfter = reqPhotos && (pMode === 'both' || pMode === 'after');
                const hasAfterPhotoInRoute = (route?.photos || []).some((p: any) => (p.category_id || null) === (catId || null) && (!routeBrandId || (p.route_brand_id || null) === routeBrandId) && p.photo_type === 'category_after');
                const hasAfter = !!catStatus?.category_after_photo || hasAfterPhotoInRoute || !!optimisticAfterPhoto[`${catId}_${routeBrandId || 'null'}`];
                
                // Uma categoria só exige foto do depois se todos os seus produtos foram executados
                return allDone && needsAfter && !hasAfter;
              });

              const allBeforePhotosDone = globalMissingBeforePhotos.length === 0;
              const allAfterPhotosDone = globalMissingAfterPhotos.length === 0;
              
              // Também checamos se todas as marcas estão concluídas (para garantir que o checklist foi processado)
              const allBrandsCompleted = isMultiBrand 
                ? routeBrands.every((rb: any) => rb.status === 'completed' || rb.progress_pct >= 100)
                : true;
              
              const minDuration = parseInt(route?.min_duration_minutes || "0", 10);
              const checkinAt = route?.checkin_at ? new Date(route.checkin_at) : null;
              const elapsedMinutes = checkinAt ? Math.floor((currentTime.getTime() - checkinAt.getTime()) / 60000) : 0;
              const hasMinDurationMet = minDuration === 0 || elapsedMinutes >= minDuration;
              
              // A rota só pode ser concluída se TODOS os produtos, TODAS as fotos (antes+depois) e tempo mínimo forem respeitados
              const stockCountPending = stockCountBlocking.length;
              const canCompleteRoute = allProductsDoneGlobal && allBrandsCompleted && allBeforePhotosDone && allAfterPhotosDone && hasMinDurationMet && stockCountPending === 0;
              
              return (
                <>
                  <Button className="w-full h-12" onClick={() => {
                    if (!allProductsDoneGlobal) {
                      const pendingExtra = allExecutions.filter((e: any) => e.status !== 'completed' && e.exposure_point === 'extra').length;
                      if (pendingExtra > 0) {
                        toast.error(`Existem ${pendingExtra} produto(s) de PONTO EXTRA pendentes de execução.`);
                      } else {
                        toast.error(`Ainda faltam ${totalExecsGlobal - completedExecsGlobal} produto(s) no total para concluir a rota.`);
                      }
                      return;
                    }
                    if (!allBeforePhotosDone) {
                      toast.error(`Existem fotos da categoria (ANTES) obrigatórias pendentes. Verifique as categorias.`);
                      return;
                    }
                    if (!allAfterPhotosDone) {
                      toast.error(`Existem fotos da categoria (DEPOIS) obrigatórias pendentes. Verifique as categorias.`);
                      return;
                    }
                    if (!allBrandsCompleted) {
                      toast.error(`Existem marcas que ainda não foram totalmente concluídas.`);
                      return;
                    }
                    if (stockCountPending > 0) {
                      toast.error(`Contagem de estoque obrigatória pendente em ${stockCountPending} marca(s).`);
                      return;
                    }
                    if (!hasMinDurationMet) {
                      toast.error(`Tempo mínimo de permanência não atingido. Faltam ${minDuration - elapsedMinutes} minuto(s).`);
                      return;
                    }
                    setShowCompleteRoute(true);
                  }} disabled={checkout.isPending} variant={canCompleteRoute ? 'default' : 'secondary'}>
                    <Check className="h-5 w-5 mr-2" /> Concluir Rota ({completedExecsGlobal}/{totalExecsGlobal})
                  </Button>
                  {!canCompleteRoute && (
                    <div className="space-y-1">
                      <p className="text-[10px] text-center text-destructive">
                        ⚠️ {!allProductsDoneGlobal 
                          ? 'Todos os produtos de TODAS as marcas devem estar executados (100%) para concluir a rota.'
                          : !allBeforePhotosDone
                            ? 'Tire as fotos obrigatórias (ANTES) de todas as categorias.'
                            : !allAfterPhotosDone
                              ? 'Tire as fotos obrigatórias (DEPOIS) de todas as categorias concluídas.'
                              : !allBrandsCompleted 
                                ? 'Conclua o checklist de todas as marcas antes de finalizar a rota.'
                                : stockCountPending > 0
                                  ? `Contagem de estoque obrigatória pendente em ${stockCountPending} marca(s).`
                                  : `Tempo mínimo: faltam ${minDuration - elapsedMinutes} min.`}
                      </p>
                      {allProductsDoneGlobal && allBrandsCompleted && allAfterPhotosDone && !hasMinDurationMet && (
                        <p className="text-[10px] text-center text-muted-foreground flex items-center justify-center gap-1">
                          <Clock className="h-3 w-3" /> Tempo mínimo de permanência: {minDuration} min
                        </p>
                      )}
                    </div>
                  )}
                </>
              );
            })()}



            {/* Extra Point button */}
            <Button variant="outline" className="w-full h-10 border-dashed border-orange-400/50 text-orange-600 hover:bg-orange-50"
              onClick={() => {
                const cats = Object.entries(groupedExecs).filter(([, v]) => !v.isExtraGroup);
                if (cats.length === 1) {
                  setShowExtraPointDialog({ catId: cats[0][1].catId, categoryName: cats[0][0] });
                  setSelectedExtraProducts([]);
                } else {
                  setShowExtraPointCategoryPicker(true);
                }
              }}>
              <Target className="h-4 w-4 mr-2" /> Registrar Ponto Extra
            </Button>

            <p className="text-[10px] text-center text-muted-foreground">
              <Info className="h-3 w-3 inline mr-1" />
              {isMultiBrand
                ? 'Concluir a rota finaliza todas as marcas. O checkout da loja só será feito na última rota do PDV.'
                : 'Concluir a rota finaliza o checklist desta marca. O checkout da loja só será feito na última rota do PDV.'}
            </p>
          </div>
  ) : null;

  return (
    <PromotorLayout>
      <div className="max-w-lg mx-auto p-4 space-y-4">
        <div className="flex justify-end">
          <SyncStatusIndicator />
        </div>
        {/* Route header card */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between mb-2">
              <div>
                <h2 className="font-bold text-lg">{route.pdv_name}</h2>
                {isMultiBrand ? (
                  <div className="flex items-center gap-2 mt-1">
                    <Badge className="bg-primary/20 text-primary text-[10px]">🏷️ Multi-marca</Badge>
                    <span className="text-xs text-muted-foreground">{routeBrands.length} marcas</span>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">{route.brand_name}</p>
                )}
                {!isMultiBrand && route.checklist_name && <p className="text-xs text-muted-foreground mt-1">Checklist: {route.checklist_name}</p>}
              </div>
              <Badge className={route.status === 'in_progress' ? 'bg-orange-500/20 text-orange-700' : route.status === 'completed' ? 'bg-green-500/20 text-green-700' : 'bg-blue-500/20 text-blue-700'}>
                {route.status === 'in_progress' ? 'Em Andamento' : route.status === 'completed' ? 'Concluída' : 'Agendada'}
              </Badge>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{route.pdv_address || route.pdv_city}</span>
              <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{route.scheduled_time?.slice(0, 5)}</span>
            </div>
            {isActive && (
              <div className="mt-3">
                <div className="flex justify-between text-xs mb-1">
                  <span>Progresso Geral</span>
                  <span className="font-mono font-bold">{Math.round(route.progress_pct || 0)}%</span>
                </div>
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${route.progress_pct || 0}%` }} />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Multi-brand: list of brands (drill-down) */}
        {isMultiBrand && isActive && !activeBrandId && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground px-1">
              Toque numa marca para abrir suas categorias.
            </p>
            {routeBrands.map((rb: any) => {
              const isDone = rb.status === 'completed';
              const isInProgress = rb.status === 'in_progress' || ((rb.progress_pct || 0) > 0 && !isDone);
              const cardCls = isDone
                ? 'border-green-500/60 bg-green-500/10 hover:bg-green-500/15'
                : isInProgress
                  ? 'border-yellow-500/60 bg-yellow-500/10 hover:bg-yellow-500/15'
                  : 'hover:border-primary/40';
              const barCls = isDone ? 'bg-green-500' : isInProgress ? 'bg-yellow-500' : 'bg-primary';
              return (
                <Card key={rb.brand_id}
                  className={`cursor-pointer transition-all ${cardCls}`}
                  onClick={() => setActiveBrandId(rb.brand_id)}>
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {isDone ? (
                          <CheckCircle2 className="h-5 w-5 text-green-600" />
                        ) : isInProgress ? (
                          <Clock className="h-5 w-5 text-yellow-600" />
                        ) : (
                          <Circle className="h-5 w-5 text-muted-foreground" />
                        )}
                        <div>
                          <div className="text-sm font-semibold">{rb.brand_name}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {isDone ? 'Concluída' : isInProgress ? 'Em andamento' : 'Pendente'}
                            {rb.checklist_name ? ` • ${rb.checklist_name}` : ''}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-mono font-bold ${isDone ? 'text-green-700' : isInProgress ? 'text-yellow-700' : ''}`}>
                          {Math.round(rb.progress_pct || 0)}%
                        </span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                    <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden mt-2">
                      <div className={`h-full rounded-full transition-all ${barCls}`}
                        style={{ width: `${rb.progress_pct || 0}%` }} />
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            {(() => {
              const allBrandsCompleted = routeBrands.length > 0 && routeBrands.every((rb: any) => rb.status === 'completed' || (rb.progress_pct || 0) >= 100);
              if (!allBrandsCompleted) return null;
              const minDuration = parseInt(route?.min_duration_minutes || "0", 10);
              const checkinAt = route?.checkin_at ? new Date(route.checkin_at) : null;
              const elapsedMinutes = checkinAt ? Math.floor((currentTime.getTime() - checkinAt.getTime()) / 60000) : 0;
              const hasMinDurationMet = minDuration === 0 || elapsedMinutes >= minDuration;
              return (
                <div className="pt-2 space-y-1">
                  <Button
                    className="w-full h-12"
                    onClick={() => {
                      if (!hasMinDurationMet) {
                        toast.error(`Tempo mínimo de permanência não atingido. Faltam ${minDuration - elapsedMinutes} minuto(s).`);
                        return;
                      }
                      setShowCompleteRoute(true);
                    }}
                    disabled={checkout.isPending}
                    variant={hasMinDurationMet ? 'default' : 'secondary'}
                  >
                    <Check className="h-5 w-5 mr-2" /> Concluir Rota
                  </Button>
                  {!hasMinDurationMet && (
                    <p className="text-[10px] text-center text-muted-foreground flex items-center justify-center gap-1">
                      <Clock className="h-3 w-3" /> Tempo mínimo: faltam {minDuration - elapsedMinutes} min
                    </p>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* Multi-brand: selected brand detail (only this brand's categories) */}
        {isMultiBrand && isActive && activeBrandId && (
          <div className="space-y-3">
            <Button variant="ghost" size="sm" className="h-8 -ml-2" onClick={() => setActiveBrandId(null)}>
              <ChevronRight className="h-4 w-4 rotate-180 mr-1" />
              Voltar para marcas
            </Button>
            <Card className="border-primary/40 bg-primary/5">
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Package className="h-5 w-5 text-primary" />
                    <div>
                      <div className="text-sm font-semibold">{currentBrand?.brand_name || 'Marca'}</div>
                      {currentBrand?.checklist_name && (
                        <div className="text-[10px] text-muted-foreground">{currentBrand.checklist_name}</div>
                      )}
                    </div>
                  </div>
                  <span className="text-sm font-mono font-bold">{Math.round(currentBrand?.progress_pct || 0)}%</span>
                </div>
                <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden mt-2">
                  <div className={`h-full rounded-full transition-all ${currentBrand?.status === 'completed' ? 'bg-green-500' : 'bg-primary'}`}
                    style={{ width: `${currentBrand?.progress_pct || 0}%` }} />
                </div>
              </CardContent>
            </Card>
            {categoriesBlock}
          </div>
        )}



        {/* Check-in photo requirement */}
        {needsCheckin && route.require_checkin_photo && !checkinPhotoUrl && (
          <Card className="border-primary/30">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Camera className="h-4 w-4 text-primary" />
                Foto obrigatória para check-in
              </div>
              <CameraCapture
                onCapture={(url) => {
                  setCheckinPhotoUrl(url);
                  // Auto-submit check-in assim que a foto for validada
                  setTimeout(() => { void handleCheckin(url); }, 0);
                }}
                watermark={{ pdvName: route.pdv_name, brandName: route.brand_name || route.route_brands?.[0]?.brand_name, photoType: 'Check-in' }}
                customTokenGetter={() => localStorage.getItem('promotor_token') || localStorage.getItem('auth_token')}
                buttonLabel="Tirar foto de check-in"
                qualityConfig={photoQualityConfig}
                allowManualUpload={false}
              />
            </CardContent>
          </Card>
        )}

        {needsCheckin && route.require_checkin_photo && checkinPhotoUrl && (
          <Card className="border-primary/30">
            <CardContent className="p-4 space-y-2">
              <LocalImage src={checkinPhotoUrl} alt="Check-in" className="w-full rounded-lg border max-h-64 object-cover" />
              <p className="text-xs text-muted-foreground text-center">
                {checkin.isPending || checkinSubmitted ? 'Realizando check-in...' : 'Foto registrada. Concluindo check-in...'}
              </p>
            </CardContent>
          </Card>
        )}

        {needsCheckin && isFacialActiveCheckin && (
          <div className="flex items-center gap-2 px-3 py-2 bg-primary/10 rounded-lg text-xs text-primary">
            <ScanFace className="h-4 w-4" />
            <span className="font-medium">Verificação facial obrigatória para check-in</span>
          </div>
        )}

        {/* Botão de check-in padrão (sem foto obrigatória) */}
        {needsCheckin && !route.require_checkin_photo && (
          <Button className="w-full h-14 text-lg" onClick={() => handleCheckin()} disabled={checkin.isPending}>
            {isFacialActiveCheckin ? <ScanFace className="h-5 w-5 mr-2" /> : <MapPin className="h-5 w-5 mr-2" />}
            {checkin.isPending ? 'Realizando check-in...' : 'Fazer Check-in'}
          </Button>
        )}


        {isActive && filteredExecs.length === 0 && activeBrandId && (
          <Card>
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              Nenhum produto foi carregado para esta {isMultiBrand ? 'marca' : 'rota'}.
            </CardContent>
          </Card>
        )}

        {/* Active route: categories with step-by-step flow */}
        {!isMultiBrand && categoriesBlock}

        {isCompleted && (
          <div className="text-center py-6">
            <CheckCircle2 className="h-12 w-12 mx-auto text-green-500 mb-2" />
            <p className="text-sm font-medium text-green-700">Rota concluída</p>
            <p className="text-xs text-muted-foreground">
              {route.checkin_at && `Check-in: ${new Date(route.checkin_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`}
              {route.checkout_at && ` • Checkout: ${new Date(route.checkout_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`}
            </p>
            {(!route.checkout_at) && (
              <Button className="w-full mt-4 bg-yellow-500 hover:bg-yellow-600 text-yellow-950 font-bold" onClick={() => setShowPdvCheckout(true)}>
                <Store className="h-4 w-4 mr-2" /> Fazer Checkout da Loja (Pendente)
              </Button>
            )}
            <Button variant="outline" size="sm" className="mt-3" onClick={() => navigate('/promotor/home')}>
              Voltar para Início
            </Button>
          </div>
        )}

        {/* Product Detail Modal */}
        <Dialog open={!!selectedExec && !activeAction} onOpenChange={() => setSelectedExec(null)}>
          <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                <div className="text-sm flex items-center gap-2">
                  {EXEC_STATUS_ICON[selectedExec?.status] || EXEC_STATUS_ICON.pending}
                  {selectedExec?.product_name}
                </div>
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge variant={selectedExec?.status === 'completed' ? 'default' : 'secondary'} className="text-[10px]">
                  {selectedExec?.status === 'completed' ? 'Executado' : selectedExec?.status === 'in_progress' ? 'Em andamento' : 'Pendente'}
                </Badge>
                {selectedExec?.exposure_point && selectedExec.exposure_point !== 'natural' && (
                  <Badge variant="outline" className="text-[10px]">{selectedExec.exposure_point}</Badge>
                )}
              </div>

              {/* Counting */}
              {requireStockCount && (

                <div className="space-y-2">
                  <Label className="text-xs font-semibold flex items-center gap-1">
                    <Store className="h-3.5 w-3.5" /> Contagem
                  </Label>
                  <div className="grid grid-cols-2 gap-2">
                    {(() => {
                      const storeVal = Number(actionForm.qty_store ?? selectedExec?.qty_store ?? 0) || 0;
                      const stockVal = Number(actionForm.qty_stock ?? selectedExec?.qty_stock ?? 0) || 0;
                      return <>
                        <div>
                          <Label className="text-[10px] text-muted-foreground">Qtd Loja</Label>
                          <Input type="number" min="0" inputMode="numeric" placeholder="0"
                            value={storeVal === 0 ? '' : storeVal}
                            onChange={e => {
                              const v = e.target.value.replace(/^0+(?=\d)/, '');
                              setActionForm({ ...actionForm, qty_store: v === '' ? 0 : parseInt(v) || 0 });
                            }} />
                        </div>
                        <div>
                          <Label className="text-[10px] text-muted-foreground">Qtd Estoque</Label>
                          <Input type="number" min="0" inputMode="numeric" placeholder="0"
                            value={stockVal === 0 ? '' : stockVal}
                            onChange={e => {
                              const v = e.target.value.replace(/^0+(?=\d)/, '');
                              setActionForm({ ...actionForm, qty_stock: v === '' ? 0 : parseInt(v) || 0 });
                            }} />
                        </div>
                      </>;
                    })()}
                  </div>
                  <div className="text-[10px] text-muted-foreground text-right">
                    Total: {(Number(actionForm.qty_store ?? selectedExec?.qty_store ?? 0) || 0) + (Number(actionForm.qty_stock ?? selectedExec?.qty_stock ?? 0) || 0)}
                  </div>
                </div>
              )}

              {/* Inline Validity (when checklist requires it) */}
              {requireValidityCheck && (
                <div className="space-y-2">
                  <Label className="text-xs font-semibold flex items-center gap-1">
                    <CalendarIcon className="h-3.5 w-3.5 text-blue-600" /> Validade mais próxima
                  </Label>
                  <Input
                    type="date"
                    value={actionForm.expiry_date ?? ''}
                    onChange={e => setActionForm({ ...actionForm, expiry_date: e.target.value })}
                  />
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    {(() => {
                      const storeVal = Number(actionForm.val_qty_store ?? 0) || 0;
                      const stockVal = Number(actionForm.val_qty_stock ?? 0) || 0;
                      return <>
                        <div>
                          <Label className="text-[10px] text-muted-foreground">Qtd na Loja (desta validade)</Label>
                          <Input type="number" min="0" inputMode="numeric" placeholder="0"
                            value={storeVal === 0 ? '' : storeVal}
                            onChange={e => {
                              const v = e.target.value.replace(/^0+(?=\d)/, '');
                              setActionForm({ ...actionForm, val_qty_store: v === '' ? 0 : parseInt(v) || 0 });
                            }} />
                        </div>
                        <div>
                          <Label className="text-[10px] text-muted-foreground">Qtd no Estoque (desta validade)</Label>
                          <Input type="number" min="0" inputMode="numeric" placeholder="0"
                            value={stockVal === 0 ? '' : stockVal}
                            onChange={e => {
                              const v = e.target.value.replace(/^0+(?=\d)/, '');
                              setActionForm({ ...actionForm, val_qty_stock: v === '' ? 0 : parseInt(v) || 0 });
                            }} />
                        </div>
                      </>;
                    })()}
                  </div>
                  <div className="text-[10px] text-muted-foreground text-right">
                    Total desta validade: {(Number(actionForm.val_qty_store ?? 0) || 0) + (Number(actionForm.val_qty_stock ?? 0) || 0)}
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Informe a data de vencimento mais próxima encontrada na loja/estoque.
                  </p>
                </div>
              )}


              {/* Observation */}
              <div>
                <Label className="text-[10px] text-muted-foreground">Observação</Label>
                <Textarea rows={2} placeholder="Observação do produto..."
                  value={actionForm.product_observation ?? selectedExec?.observation ?? ''}
                  onChange={e => setActionForm({ ...actionForm, product_observation: e.target.value })} />
              </div>

              {/* Action buttons */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold">Registrar ocorrência</Label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { key: 'validity', label: 'Validade', icon: CalendarIcon, color: 'text-blue-600', show: !requireValidityCheck },
                    { key: 'rupture', label: 'Ruptura', icon: AlertTriangle, color: 'text-red-600', show: true },
                    { key: 'damage', label: 'Avaria', icon: Archive, color: 'text-orange-600', show: true },
                    { key: 'discard', label: 'Descarte', icon: Trash2, color: 'text-purple-600', show: true },
                  ].filter(a => a.show).map(a => (
                    <Button key={a.key} variant="outline" className="h-12 flex-col gap-0.5 text-[10px]"
                      onClick={() => setActiveAction(a.key as ActionType)}>
                      <a.icon className={`h-4 w-4 ${a.color}`} />
                      <span>{a.label}</span>
                    </Button>
                  ))}
                </div>
              </div>

            </div>
            <DialogFooter className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setSelectedExec(null)}>Fechar</Button>
              <Button size="sm" onClick={() => {
                if (!selectedExec) return;
                const qtyStore = actionForm.qty_store ?? selectedExec.qty_store ?? 0;
                const qtyStock = actionForm.qty_stock ?? selectedExec.qty_stock ?? 0;
                const observation = actionForm.product_observation ?? selectedExec.observation;
                const expiryDate = actionForm.expiry_date || null;

                if (requireValidityCheck && !expiryDate) {
                  toast.error('Informe a data de validade mais próxima.');
                  return;
                }

                const body = {
                  id: selectedExec.id,
                  qty_store: qtyStore,
                  qty_stock: qtyStock,
                  observation,
                  status: 'completed', checked: true,
                };

                // Save validity inline when checklist requires it
                const saveValidityIfNeeded = async () => {
                  if (!requireValidityCheck || !expiryDate) return;
                  const valStore = Number(actionForm.val_qty_store ?? 0) || 0;
                  const valStock = Number(actionForm.val_qty_stock ?? 0) || 0;
                  const validityBody = {
                    expiry_date: expiryDate,
                    qty_store: valStore,
                    qty_stock: valStock,
                    replace: true,
                  };
                  if (!isOnline) {
                    queueApiCall({
                      url: `/api/merch/promotor/executions/${selectedExec.id}/validity`,
                      method: 'POST',
                      body: validityBody,
                      headers: { 'Authorization': `Bearer ${localStorage.getItem('promotor_token') || localStorage.getItem('auth_token')}` }
                    });
                  } else {
                    await addValidity.mutateAsync({ executionId: selectedExec.id, ...validityBody }).catch((e: any) => {
                      toast.error('Erro ao salvar validade: ' + (e?.message || ''));
                      throw e;
                    });
                  }
                };

                if (!isOnline) {
                  queueApiCall({
                    url: `/api/merch/promotor/executions/${selectedExec.id}`,
                    method: 'PUT',
                    body: { qty_store: qtyStore, qty_stock: qtyStock, observation, status: 'completed', checked: true },
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('promotor_token') || localStorage.getItem('auth_token')}` }
                  });
                  saveValidityIfNeeded();
                  setSelectedExec(null);
                  return;
                }

                (async () => {
                  try {
                    await saveValidityIfNeeded();
                    await updateExec.mutateAsync(body);
                    setSelectedExec(null);
                  } catch (err: any) {
                    if (err?.message) toast.error(err.message);
                  }
                })();
              }} disabled={updateExec.isPending || addValidity.isPending}>
                <Check className="h-4 w-4 mr-1" />
                {(updateExec.isPending || addValidity.isPending) ? 'Salvando...' : 'Salvar e Concluir'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Action detail dialog */}
        <Dialog open={!!activeAction} onOpenChange={() => setActiveAction(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>
                <span className="text-sm">
                  {activeAction === 'validity' ? 'Registrar Validade' : activeAction === 'rupture' ? 'Registrar Ruptura' : activeAction === 'damage' ? 'Registrar Avaria' : 'Registrar Descarte'}
                  {selectedExec && <span className="block text-xs font-normal text-muted-foreground mt-1">{selectedExec.product_name}</span>}
                </span>
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              {activeAction === 'validity' && (
                <>
                  <div><Label className="text-xs">Data de Validade</Label><Input type="date" value={actionForm.expiry_date || ''} onChange={e => setActionForm({ ...actionForm, expiry_date: e.target.value })} /></div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label className="text-xs">Qtd Loja</Label><Input type="number" placeholder="0" value={actionForm.val_qty_store ?? ''} onChange={e => setActionForm({ ...actionForm, val_qty_store: parseInt(e.target.value) || 0 })} /></div>
                    <div><Label className="text-xs">Qtd Estoque</Label><Input type="number" placeholder="0" value={actionForm.val_qty_stock ?? ''} onChange={e => setActionForm({ ...actionForm, val_qty_stock: parseInt(e.target.value) || 0 })} /></div>
                  </div>
                </>
              )}
              {(activeAction === 'rupture' || activeAction === 'damage' || activeAction === 'discard') && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label className="text-xs">Qtd Loja</Label><Input type="number" placeholder="0" value={actionForm.occ_qty_store ?? ''} onChange={e => setActionForm({ ...actionForm, occ_qty_store: parseInt(e.target.value) || 0 })} /></div>
                    <div><Label className="text-xs">Qtd Estoque</Label><Input type="number" placeholder="0" value={actionForm.occ_qty_stock ?? ''} onChange={e => setActionForm({ ...actionForm, occ_qty_stock: parseInt(e.target.value) || 0 })} /></div>
                  </div>
                  <div><Label className="text-xs">Motivo</Label><Input placeholder="Motivo" value={actionForm.reason ?? ''} onChange={e => setActionForm({ ...actionForm, reason: e.target.value })} /></div>
                  <div><Label className="text-xs">Observação</Label><Textarea rows={2} placeholder="Observação" value={actionForm.observation ?? ''} onChange={e => setActionForm({ ...actionForm, observation: e.target.value, description: e.target.value })} /></div>
                  {activeAction === 'damage' && (
                    <div>
                      <Label className="text-xs">Local</Label>
                      <Select value={actionForm.location} onValueChange={v => setActionForm({ ...actionForm, location: v })}>
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="store">Loja</SelectItem>
                          <SelectItem value="stock">Estoque</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setActiveAction(null)}>Cancelar</Button>
              <Button onClick={() => {
                if (!selectedExec || !activeAction) return;
                const execId = selectedExec.id;
                const onDone = () => { setActiveAction(null); };
                const onErr = (err: any) => toast.error(err.message);
                
                const body: any = { executionId: execId };
                let url = '';
                
                if (activeAction === 'validity') {
                  url = `/api/merch/promotor/executions/${execId}/validity`;
                  body.expiry_date = actionForm.expiry_date;
                  body.qty_store = actionForm.val_qty_store || 0;
                  body.qty_stock = actionForm.val_qty_stock || 0;
                } else if (activeAction === 'rupture') {
                  url = `/api/merch/promotor/executions/${execId}/rupture`;
                  body.qty_store = actionForm.occ_qty_store || 0;
                  body.qty_stock = actionForm.occ_qty_stock || 0;
                  body.reason = actionForm.reason;
                  body.observation = actionForm.observation;
                } else if (activeAction === 'damage') {
                  url = `/api/merch/promotor/executions/${execId}/damage`;
                  body.qty_store = actionForm.occ_qty_store || 0;
                  body.qty_stock = actionForm.occ_qty_stock || 0;
                  body.reason = actionForm.reason;
                  body.observation = actionForm.observation;
                  body.description = actionForm.observation;
                  body.location = actionForm.location;
                } else if (activeAction === 'discard') {
                  url = `/api/merch/promotor/executions/${execId}/discard`;
                  body.qty_store = actionForm.occ_qty_store || 0;
                  body.qty_stock = actionForm.occ_qty_stock || 0;
                  body.reason = actionForm.reason;
                  body.observation = actionForm.observation;
                }

                queueApiCall({
                  url,
                  method: 'POST',
                  body,
                  headers: { 'Authorization': `Bearer ${localStorage.getItem('promotor_token') || localStorage.getItem('auth_token')}` }
                });
                onDone();

              }}>Salvar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Complete Route Dialog */}
        <Dialog open={showCompleteRoute} onOpenChange={setShowCompleteRoute}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Concluir Rota</DialogTitle>
            </DialogHeader>
            <p className="text-xs text-muted-foreground">
              Ao concluir esta rota, o checklist de <b>{currentBrand?.brand_name || route.brand_name}</b> será finalizado.
              Se houver mais rotas neste PDV, o checkout da loja será feito depois.
            </p>
            <div>
              <Label className="text-xs">Observação de encerramento</Label>
              <Textarea rows={3} placeholder="Observações finais..." onChange={e => setActionForm({ ...actionForm, notes: e.target.value })} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCompleteRoute(false)}>Cancelar</Button>
              <Button onClick={handleCompleteRoute} disabled={checkout.isPending}>
                {checkout.isPending ? 'Concluindo...' : 'Confirmar Conclusão'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* PDV Checkout Dialog */}
        <Dialog open={showPdvCheckout} onOpenChange={setShowPdvCheckout}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Store className="h-5 w-5 text-primary" /> Checkout da Loja
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <Card className="border-green-500/30 bg-green-500/5">
                <CardContent className="p-3">
                  <p className="text-sm font-medium text-green-700">✅ Última rota concluída!</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Esta era a última rota neste PDV. Faça o checkout da loja para encerrar a visita.
                  </p>
                </CardContent>
              </Card>

              {route.require_checkout_photo && (
                <div className="space-y-2">
                  <Label className="text-xs">Foto final da loja (obrigatória)</Label>
                  {pdvCheckoutPhoto ? (
                    <div className="space-y-2">
                      <LocalImage src={pdvCheckoutPhoto} alt="Checkout" className="w-full rounded-lg border max-h-48 object-cover" />
                      <Button variant="outline" size="sm" onClick={() => setPdvCheckoutPhoto('')}>Tirar outra foto</Button>
                    </div>
                  ) : (
                    <CameraCapture
                      onCapture={setPdvCheckoutPhoto}
                      watermark={{ pdvName: route.pdv_name, brandName: route.brand_name || route.route_brands?.[0]?.brand_name, photoType: 'Checkout PDV' }}
                      customTokenGetter={() => localStorage.getItem('promotor_token') || localStorage.getItem('auth_token')}
                      buttonLabel="Tirar foto de saída da loja"
                      qualityConfig={photoQualityConfig}
                      allowManualUpload={false}
                    />
                  )}
                </div>
              )}


              <div>
                <Label className="text-xs">Observação</Label>
                <Textarea rows={2} placeholder="Observações sobre a visita..." onChange={e => setActionForm({ ...actionForm, pdv_notes: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setShowPdvCheckout(false); navigate('/promotor/home'); }}>
                Pular
              </Button>
              <Button onClick={handlePdvCheckout} disabled={route.require_checkout_photo && !pdvCheckoutPhoto}>
                Fazer Checkout
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Extra Point Category Picker Dialog */}
        <Dialog open={showExtraPointCategoryPicker} onOpenChange={setShowExtraPointCategoryPicker}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle className="text-sm">Selecione a Categoria</DialogTitle></DialogHeader>
            <div className="space-y-2">
              {Object.entries(groupedExecs).filter(([, v]) => !v.isExtraGroup).map(([category, { catId }]) => (
                <Button key={catId} variant="outline" className="w-full justify-start" onClick={() => {
                  setShowExtraPointCategoryPicker(false);
                  setShowExtraPointDialog({ catId, categoryName: category });
                  setSelectedExtraProducts([]);
                }}>
                  <Target className="h-4 w-4 mr-2 text-orange-600" /> {category}
                </Button>
              ))}
            </div>
          </DialogContent>
        </Dialog>

        {/* Extra Point Product Selection Dialog */}
        <Dialog open={!!showExtraPointDialog} onOpenChange={() => setShowExtraPointDialog(null)}>
          <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-sm flex items-center gap-2">
                <Target className="h-4 w-4 text-orange-600" /> Ponto Extra
              </DialogTitle>
              <p className="text-xs text-muted-foreground">
                Selecione os produtos de <b>{showExtraPointDialog?.categoryName}</b> que estão neste ponto extra.
              </p>
            </DialogHeader>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {showExtraPointDialog && (groupedExecs[showExtraPointDialog.categoryName]?.execs || [])
                .filter((e: any) => e.exposure_point !== 'extra' && !productsWithExtraPoint.has(`${e.category_id}_${e.product_id}`))
                .map((exec: any) => (
                  <label key={exec.id} className="flex items-center gap-3 p-2 rounded-lg border cursor-pointer hover:bg-accent/50">
                    <Checkbox
                      checked={selectedExtraProducts.includes(exec.product_id)}
                      onCheckedChange={(checked) => {
                        setSelectedExtraProducts(prev =>
                          checked ? [...prev, exec.product_id] : prev.filter(id => id !== exec.product_id)
                        );
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium">{exec.product_name}</span>
                      {exec.sku && <span className="text-[10px] text-muted-foreground ml-2">SKU: {exec.sku}</span>}
                    </div>
                  </label>
                ))}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowExtraPointDialog(null)}>Cancelar</Button>
              <Button disabled={selectedExtraProducts.length === 0 || registerExtraPoint.isPending}
                onClick={() => {
                  if (!showExtraPointDialog) return;
                  registerExtraPoint.mutate({
                    routeId: id!,
                    catId: showExtraPointDialog.catId,
                    product_ids: selectedExtraProducts,
                  }, {
                    onSuccess: (data: any) => {
                      // Removed toast per user request
                      setShowExtraPointDialog(null);
                      setSelectedExtraProducts([]);
                    },
                    onError: (err: any) => toast.error(err.message),
                  });
                }}>
                <Plus className="h-4 w-4 mr-1" />
                {registerExtraPoint.isPending ? 'Registrando...' : `Registrar ${selectedExtraProducts.length} produto(s)`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {/* Facial Verification Dialog */}
        <FaceVerifyDialog
          open={showFaceVerify}
          onOpenChange={(open) => { if (!open) { setShowFaceVerify(false); setFaceVerifyAction(null); } }}
          storedDescriptor={facialConfig?.descriptor || []}
          storedPhotoUrl={facialConfig?.photo_url}
          personName={route?.promotor_name}
          threshold={facialConfig?.min_confidence || 70}
          onResult={(result) => {
            setShowFaceVerify(false);
            if (result.match) {
              toast.success(`Identidade confirmada (${result.score.toFixed(1)}%)`);
              const action = faceVerifyAction;
              setTimeout(() => {
                if (action === 'checkin') handleCheckin();
                else if (action === 'checkout') handleCompleteRoute();
                else if (action === 'pdv_checkout') handlePdvCheckout();
              }, 300);
            } else {
              toast.error(`Identidade não confirmada (${result.score.toFixed(1)}%). Ação bloqueada.`);
              setFaceVerifyAction(null);
            }
          }}
        />
      </div>
    </PromotorLayout>
  );
}
