import { useState, useEffect, useCallback, useRef } from 'react';
import { db, type PendingApiCall, type PendingUpload } from '@/lib/offline-db';
import { api, API_URL } from '@/lib/api';

import { logger } from '@/lib/logger';

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

export function useOfflineSync() {
  const isOnline = useOnlineStatus();
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{ total: number; done: number; failed: number }>({ total: 0, done: 0, failed: 0 });
  const syncingRef = useRef(false);
  const [localFileUrls, setLocalFileUrls] = useState<Record<string, string>>({});
  const urlsToRevoke = useRef<Set<string>>(new Set());

  // Helper to get actual blob URL from localId
  const getLocalFileUrl = useCallback(async (localId: string) => {
    // If we already have a URL for this localId in state, use it
    if (localFileUrls[localId]) return localFileUrls[localId];
    
    // Check if we have a URL for this localId in the ref (already created but not yet in state)
    // Actually, state is better for reactivity.
    
    const upload = await db.pending_uploads.where('localId').equals(localId).first();
    if (upload && upload.file) {
      const url = URL.createObjectURL(upload.file);
      urlsToRevoke.current.add(url);
      setLocalFileUrls(prev => ({ ...prev, [localId]: url }));
      return url;
    }
    return null;
  }, [localFileUrls]);

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      urlsToRevoke.current.forEach(url => URL.revokeObjectURL(url));
      urlsToRevoke.current.clear();
    };
  }, []);

  const sync = useCallback(async () => {
    if (!isOnline) return;
    // Ref-based lock: state (`isSyncing`) fica desatualizado em closures e
    // permite execuções paralelas de sync() que duplicam uploads.
    if (syncingRef.current) return;
    syncingRef.current = true;
    setIsSyncing(true);

    try {
    // Recupera itens travados em 'uploading'/'processing' de execuções anteriores
    // e reprocessa também os 'failed' — retry automático a cada sync.
    await db.pending_uploads.where('status').anyOf('failed', 'uploading').modify({ status: 'pending' });
    await db.pending_api_calls.where('status').anyOf('failed', 'processing').modify({ status: 'pending' });

    const pendingUploads = await db.pending_uploads.where('status').equals('pending').toArray();
    const pendingCalls = await db.pending_api_calls.where('status').equals('pending').toArray();

    const totalItems = pendingUploads.length + pendingCalls.length;
    setSyncProgress({ total: totalItems, done: 0, failed: 0 });

    if (totalItems === 0) return;

    // Cleanup old mappings (older than 3 days) to keep DB small
    const threeDaysAgo = Date.now() - (3 * 24 * 60 * 60 * 1000);
    await db.upload_mappings.where('timestamp').below(threeDaysAgo).delete();

    logger.info('[OfflineSync] Iniciando sincronização', { 
      uploads: pendingUploads.length, 
      calls: pendingCalls.length 
    });

    // 1. Process Uploads (concorrência limitada — #5)
    const UPLOAD_CONCURRENCY = 3;
    const processOneUpload = async (upload: typeof pendingUploads[number]) => {
      try {
        // Claim atômico: só processa se ainda estiver 'pending'.
        // modify() retorna o número de linhas alteradas — se 0, outro
        // processo já pegou este upload e devemos ignorar.
        const claimed = await db.pending_uploads
          .where('id').equals(upload.id!)
          .and(u => u.status === 'pending')
          .modify({ status: 'uploading' });
        if (claimed === 0) {
          logger.info('[OfflineSync] Upload já reivindicado por outra execução', { id: upload.id });
          return;
        }

        // Se já existe mapeamento (upload anterior concluído mas a linha
        // não foi apagada por qualquer motivo), apenas limpa e sai.
        const existing = await db.upload_mappings.get(upload.localId);
        if (existing) {
          await db.pending_uploads.delete(upload.id!);
          return;
        }

        const formData = new FormData();
        formData.append('file', upload.file, upload.fileName);

        const response = await fetch(`${API_URL}/api/uploads`, {
          method: 'POST',
          headers: {
            ...(upload.token ? { 'Authorization': `Bearer ${upload.token}` } : {}),
            // Chave de idempotência: mesmo se um retry de rede reenviar,
            // o cliente reconhece o mesmo upload lógico. Backend pode
            // opcionalmente honrar para deduplicar server-side.
            'X-Idempotency-Key': upload.localId,
          },
          body: formData
        });

        if (!response.ok) throw new Error(`Upload failed with status ${response.status}`);

        const result = await response.json();
        let fileUrl = result.file.url;
        if (fileUrl.startsWith('/') && API_URL) {
          fileUrl = `${API_URL}${fileUrl}`;
        }

        logger.info('[OfflineSync] Upload concluído, salvando mapeamento', { localId: upload.localId, url: fileUrl });

        // Save to persistent mapping so future API calls can resolve it
        await db.upload_mappings.put({ localId: upload.localId, serverUrl: fileUrl, timestamp: Date.now() });

        // CRITICAL: Update all currently pending API calls that might use this localId
        const callsToUpdate = await db.pending_api_calls.toArray();
        const fullLocalRef = `local-file://${upload.localId}`;

        for (const call of callsToUpdate) {
          let bodyChanged = false;

          const updateBodyRefs = (obj: any): any => {
            if (typeof obj === 'string') {
              if (obj === fullLocalRef || obj === upload.localId) {
                bodyChanged = true;
                return fileUrl;
              }
              return obj;
            }
            if (Array.isArray(obj)) return obj.map(updateBodyRefs);
            if (obj !== null && typeof obj === 'object') {
              const newObj: any = {};
              for (const key in obj) {
                newObj[key] = updateBodyRefs(obj[key]);
              }
              return newObj;
            }
            return obj;
          };

          const newBody = updateBodyRefs(call.body);
          if (bodyChanged) {
            await db.pending_api_calls.update(call.id!, { body: newBody });
          }
        }

        await db.pending_uploads.delete(upload.id!);
        setSyncProgress(p => ({ ...p, done: p.done + 1 }));
      } catch (err: any) {
        logger.error('[OfflineSync] Erro no upload', { id: upload.id, error: err.message });
        await db.pending_uploads.update(upload.id!, { status: 'failed', error: err.message });
        setSyncProgress(p => ({ ...p, failed: p.failed + 1 }));
      }
    };

    // Processa em "lotes" do tamanho de UPLOAD_CONCURRENCY
    for (let i = 0; i < pendingUploads.length; i += UPLOAD_CONCURRENCY) {
      const slice = pendingUploads.slice(i, i + UPLOAD_CONCURRENCY);
      await Promise.all(slice.map(processOneUpload));
    }


    // Refresh pending calls list since we might have updated them
    const updatedPendingCalls = await db.pending_api_calls.where('status').equals('pending').toArray();
    
    // Load all current mappings for resolution
    const allMappings = await db.upload_mappings.toArray();
    const mappingMap = new Map(allMappings.map(m => [m.localId, m.serverUrl]));

    // 2. Process API Calls
    for (const call of updatedPendingCalls) {
      try {
        await db.pending_api_calls.update(call.id!, { status: 'processing' });

        // Resolve any local-file references using the mapping map
        const resolveRefs = (obj: any): any => {
          if (typeof obj === 'string') {
            if (obj.startsWith('local-file://')) {
              const lid = obj.replace('local-file://', '');
              return mappingMap.get(lid) || obj;
            }
            return mappingMap.get(obj) || obj;
          }
          if (Array.isArray(obj)) return obj.map(resolveRefs);
          if (obj !== null && typeof obj === 'object') {
            const newObj: any = {};
            for (const key in obj) {
              newObj[key] = resolveRefs(obj[key]);
            }
            return newObj;
          }
          return obj;
        };

        const body = resolveRefs(call.body);
        
        // Final safety check
        const hasLocalRefs = (obj: any): boolean => {
          if (typeof obj === 'string') return obj.startsWith('local-file://');
          if (Array.isArray(obj)) return obj.some(hasLocalRefs);
          if (obj !== null && typeof obj === 'object') {
            return Object.values(obj).some(hasLocalRefs);
          }
          return false;
        };

        if (hasLocalRefs(body)) {
          logger.warn('[OfflineSync] Chamada API ainda possui referências locais, aguardando upload...', { url: call.url });
          await db.pending_api_calls.update(call.id!, { status: 'pending' });
          continue;
        }

        await api(call.url, {
          method: call.method as any,
          body,
          headers: call.headers
        });

        await db.pending_api_calls.delete(call.id!);
        setSyncProgress(p => ({ ...p, done: p.done + 1 }));
        logger.info('[OfflineSync] Chamada API concluída', { url: call.url });
      } catch (err: any) {
        logger.error('[OfflineSync] Erro na chamada API', { id: call.id, error: err.message, url: call.url });
        await db.pending_api_calls.update(call.id!, { status: 'failed', error: err.message });
        setSyncProgress(p => ({ ...p, failed: p.failed + 1 }));
      }
    }
    } finally {
      syncingRef.current = false;
      setIsSyncing(false);
    }
  }, [isOnline]);

  const queueUpload = useCallback(async (file: File, token: string | null): Promise<string> => {
    const localId = `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Convert file to base64 for persistent storage if it's small, 
    // or keep as Blob/File if Dexie handles it (it does in IndexedDB)
    await db.pending_uploads.add({
      file: file,
      fileName: file.name,
      fileType: file.type,
      timestamp: Date.now(),
      token,
      status: 'pending',
      localId
    });

    if (isOnline) {
      setTimeout(() => sync(), 100);
    }

    // IMPORTANT: Return the localId as the reference, NOT a transient blob URL
    // This allows the UI to know it's a pending file
    return `local-file://${localId}`;
  }, [isOnline, sync]);

  const queueApiCall = useCallback(async (config: Omit<PendingApiCall, 'status' | 'timestamp'>) => {
    await db.pending_api_calls.add({
      ...config,
      status: 'pending',
      timestamp: Date.now()
    });
    
    if (isOnline) {
      setTimeout(() => sync(), 100);
    }

  }, [isOnline, sync]);

  // Auto-sync when coming online
  useEffect(() => {
    if (isOnline) {
      sync();
    }
  }, [isOnline, sync]);

  // Retry periódico enquanto houver pendências e o app estiver online.
  // Evita a situação em que o promotor tira fotos, a rede oscila e os itens
  // ficam parados com status='failed' até o próximo evento 'online'.
  useEffect(() => {
    if (!isOnline) return;
    const interval = setInterval(async () => {
      try {
        const [u, c] = await Promise.all([
          db.pending_uploads.count(),
          db.pending_api_calls.count(),
        ]);
        if ((u + c) > 0) sync();
      } catch {}
    }, 30000);
    return () => clearInterval(interval);
  }, [isOnline, sync]);

  return { isOnline, isSyncing, queueUpload, queueApiCall, sync, getLocalFileUrl };
}
