import { useState, useEffect } from 'react';
import { useOfflineSync } from '@/hooks/use-offline-sync';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

interface LocalImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string | undefined;
}

export function LocalImage({ src, className, ...props }: LocalImageProps) {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const { getLocalFileUrl } = useOfflineSync();

  useEffect(() => {
    let isMounted = true;
    setHasError(false);
    
    async function resolve() {
      if (!src) {
        if (isMounted) {
          setResolvedUrl(null);
          setIsLoading(false);
        }
        return;
      }

      if (src.startsWith('local-file://')) {
        const localId = src.replace('local-file://', '');
        const url = await getLocalFileUrl(localId);
        if (isMounted) {
          setResolvedUrl(url);
          setIsLoading(false);
        }
      } else {
        if (isMounted) {
          setResolvedUrl(src);
          setIsLoading(false);
        }
      }
    }

    resolve();

    return () => {
      isMounted = false;
    };
  }, [src, getLocalFileUrl]);

  if (isLoading) {
    return <Skeleton className={cn("w-full h-full", className)} />;
  }

  // If it's a blob URL and it failed to load, it's likely from a previous session.
  // We show a placeholder or nothing instead of a broken icon.
  if (!resolvedUrl || hasError) {
    return (
      <div className={cn("flex items-center justify-center bg-muted text-muted-foreground text-[10px] text-center p-1", className)}>
        {hasError ? "Imagem indisponível" : "Sem imagem"}
      </div>
    );
  }

  return (
    <img
      src={resolvedUrl}
      className={className}
      onError={() => {
        console.warn('[LocalImage] Failed to load image:', resolvedUrl);
        setHasError(true);
      }}
      {...props}
    />
  );
}
