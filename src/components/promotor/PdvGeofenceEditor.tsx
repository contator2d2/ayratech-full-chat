import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { MapPin, Trash2, Undo2, Save } from 'lucide-react';

export interface PolygonPoint { lat: number; lng: number; }

interface Props {
  value?: PolygonPoint[] | null;
  centerLat?: number | string | null;
  centerLng?: number | string | null;
  radiusMeters?: number | null;
  onChange: (polygon: PolygonPoint[] | null) => void;
  onUseCentroid?: (lat: number, lng: number) => void;
}

/**
 * Editor de geofence poligonal. Click no mapa adiciona vértice.
 * Marcadores são arrastáveis. "Fechar" gera o polígono.
 */
export function PdvGeofenceEditor({ value, centerLat, centerLng, radiusMeters, onChange, onUseCentroid }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const markersLayer = useRef<L.LayerGroup | null>(null);
  const polygonLayer = useRef<L.Polygon | null>(null);
  const radiusLayer = useRef<L.Circle | null>(null);
  const [points, setPoints] = useState<PolygonPoint[]>(Array.isArray(value) ? value : []);

  const lat = Number(centerLat) || -23.55052;
  const lng = Number(centerLng) || -46.633308;

  // init map once
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;
    const map = L.map(mapRef.current, { zoomControl: true }).setView([lat, lng], 19);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 22, attribution: '© OpenStreetMap'
    }).addTo(map);
    // Satellite overlay via Esri (better for drawing store boundary)
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 22, attribution: '© Esri', opacity: 1
    }).addTo(map);

    markersLayer.current = L.layerGroup().addTo(map);
    mapInstance.current = map;

    map.on('click', (e: L.LeafletMouseEvent) => {
      setPoints((prev) => [...prev, { lat: e.latlng.lat, lng: e.latlng.lng }]);
    });

    // Fix tile rendering inside a dialog (initial width may be 0)
    const invalidate = () => map.invalidateSize();
    setTimeout(invalidate, 50);
    setTimeout(invalidate, 250);
    setTimeout(invalidate, 600);
    const ro = new ResizeObserver(() => invalidate());
    if (mapRef.current) ro.observe(mapRef.current);
    return () => { ro.disconnect(); map.remove(); mapInstance.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // update center marker + radius circle
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;
    if (radiusLayer.current) { radiusLayer.current.remove(); radiusLayer.current = null; }
    if (Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0) {
      radiusLayer.current = L.circle([lat, lng], {
        radius: Number(radiusMeters) || 200,
        color: '#f59e0b', weight: 1, fillOpacity: 0.05, dashArray: '4,4'
      }).addTo(map);
      map.setView([lat, lng], map.getZoom() < 18 ? 19 : map.getZoom());
    }
  }, [lat, lng, radiusMeters]);

  // render polygon + markers whenever points change
  useEffect(() => {
    const map = mapInstance.current;
    const layer = markersLayer.current;
    if (!map || !layer) return;
    layer.clearLayers();
    if (polygonLayer.current) { polygonLayer.current.remove(); polygonLayer.current = null; }

    points.forEach((p, idx) => {
      const marker = L.marker([p.lat, p.lng], {
        draggable: true,
        icon: L.divIcon({
          className: 'pdv-vertex',
          html: `<div style="background:#3b82f6;color:white;border-radius:9999px;width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.4)">${idx + 1}</div>`,
          iconSize: [22, 22], iconAnchor: [11, 11],
        }),
      });
      marker.on('drag', (e: any) => {
        const ll = e.target.getLatLng();
        setPoints((prev) => prev.map((pp, i) => (i === idx ? { lat: ll.lat, lng: ll.lng } : pp)));
      });
      marker.on('contextmenu', () => {
        setPoints((prev) => prev.filter((_, i) => i !== idx));
      });
      marker.addTo(layer);
    });

    if (points.length >= 3) {
      polygonLayer.current = L.polygon(points.map((p) => [p.lat, p.lng] as [number, number]), {
        color: '#10b981', weight: 2, fillOpacity: 0.2,
      }).addTo(map);
    } else if (points.length === 2) {
      L.polyline(points.map((p) => [p.lat, p.lng] as [number, number]), { color: '#3b82f6', dashArray: '4,4' }).addTo(layer);
    }

    onChange(points.length >= 3 ? points : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Label className="flex items-center gap-1"><MapPin className="h-4 w-4" /> Perímetro do PDV (opcional)</Label>
        <div className="flex gap-1 flex-wrap">
          {onUseCentroid && points.length >= 3 && (
            <Button size="sm" variant="outline" type="button" onClick={() => {
              const cx = points.reduce((s, p) => s + p.lat, 0) / points.length;
              const cy = points.reduce((s, p) => s + p.lng, 0) / points.length;
              onUseCentroid(cx, cy);
            }}>
              <MapPin className="h-3.5 w-3.5 mr-1" /> Usar centro do polígono
            </Button>
          )}
          <Button size="sm" variant="ghost" type="button" onClick={() => setPoints((p) => p.slice(0, -1))} disabled={!points.length}>
            <Undo2 className="h-3.5 w-3.5 mr-1" /> Desfazer
          </Button>
          <Button size="sm" variant="ghost" type="button" onClick={() => setPoints([])} disabled={!points.length}>
            <Trash2 className="h-3.5 w-3.5 mr-1" /> Limpar
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Clique no mapa para adicionar vértices (mín. 3). Arraste marcadores para ajustar. Clique com o botão direito no marcador para removê-lo.
        Quando desenhado, substitui a validação por raio.
      </p>
      <div ref={mapRef} style={{ height: 360, width: '100%', borderRadius: 8, overflow: 'hidden' }} />
      <div className="text-xs text-muted-foreground flex items-center gap-2">
        {points.length >= 3 ? (
          <span className="text-green-600 font-medium flex items-center gap-1"><Save className="h-3 w-3" /> Polígono válido ({points.length} pontos)</span>
        ) : (
          <span>Adicione {Math.max(0, 3 - points.length)} ponto(s) para formar o perímetro.</span>
        )}
      </div>
    </div>
  );
}
