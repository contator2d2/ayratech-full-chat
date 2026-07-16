/**
 * Totem de Ponto — Fullscreen kiosk page
 * URL: /rh/totem?token=<device_token>
 *
 * Dois fluxos:
 *  - Biometria ON  → botão único "Bater Ponto" → câmera → reconhecimento 1:N →
 *                    confirmação com nome + foto cadastrada → registra → obrigado.
 *  - Biometria OFF → fluxo clássico por CPF.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Loader2, Camera, CheckCircle2, XCircle, Clock, User, Fingerprint } from "lucide-react";
import { loadFaceModels, detectFace, compareFaces } from "@/lib/facial-recognition";
import { API_URL } from "@/lib/api";

type Step = 'idle' | 'cpf' | 'scanning' | 'confirm' | 'success' | 'error';

type RosterEntry = {
  employee_id: string;
  full_name: string;
  face_photo_url?: string | null;
  face_descriptor: number[];
};

const PUNCH_LABELS: Record<string, string> = {
  entrada: 'Entrada',
  saida_intervalo: 'Saída Intervalo',
  retorno_intervalo: 'Retorno Intervalo',
  saida: 'Saída',
};

function formatCPF(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  return d.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2}).*/, (_m, a, b, c, e) => e ? `${a}.${b}.${c}-${e}` : c ? `${a}.${b}.${c}` : b ? `${a}.${b}` : a);
}

const KEYS = ['1','2','3','4','5','6','7','8','9','0'];
const MATCH_THRESHOLD = 60; // % similarity

export default function RHTotem() {
  const [params] = useSearchParams();
  const token = params.get('token') || localStorage.getItem('totem_token') || '';

  const [requireFace, setRequireFace] = useState<boolean | null>(null);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [step, setStep] = useState<Step>('idle');
  const [cpf, setCpf] = useState('');
  const [candidate, setCandidate] = useState<RosterEntry | null>(null);
  const [candidateScore, setCandidateScore] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [now, setNow] = useState(new Date());
  const [busy, setBusy] = useState(false);
  const [modelsReady, setModelsReady] = useState(false);
  const [lastPunch, setLastPunch] = useState<any>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimerRef = useRef<any>(null);

  useEffect(() => {
    if (token) localStorage.setItem('totem_token', token);
    const t = setInterval(() => setNow(new Date()), 1000);
    loadFaceModels().then(() => setModelsReady(true)).catch(() => setModelsReady(false));
    return () => clearInterval(t);
  }, [token]);

  const apiCall = async (path: string, body: any) => {
    const base = API_URL || '';
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Totem-Token': token },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro');
    return data;
  };

  // Load roster once (defines mode)
  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const data = await apiCall('/api/rh/totem/roster', {});
        setRequireFace(!!data.require_face);
        setRoster(data.employees || []);
        setStep(data.require_face ? 'idle' : 'cpf');
      } catch {
        setRequireFace(false);
        setStep('cpf');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const stopCamera = () => {
    if (scanTimerRef.current) { clearInterval(scanTimerRef.current); scanTimerRef.current = null; }
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  };
  useEffect(() => () => stopCamera(), []);

  const reset = () => {
    stopCamera();
    setCpf(''); setCandidate(null); setCandidateScore(null);
    setMessage(''); setLastPunch(null);
    setStep(requireFace ? 'idle' : 'cpf');
  };

  // ==== Face-only flow ====
  const startFaceFlow = async () => {
    if (!modelsReady) { setMessage('Carregando modelo facial...'); setStep('error'); setTimeout(reset, 2500); return; }
    if (!roster.length) { setMessage('Nenhum colaborador com biometria cadastrada.'); setStep('error'); setTimeout(reset, 3000); return; }
    setMessage(''); setStep('scanning');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640, height: 480 } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      // scan loop
      let attempts = 0;
      scanTimerRef.current = setInterval(async () => {
        attempts++;
        if (!videoRef.current || busy) return;
        try {
          const det = await detectFace(videoRef.current);
          if (!det?.descriptor) {
            if (attempts > 40) { throw new Error('Rosto não detectado. Reposicione-se.'); }
            return;
          }
          // 1:N compare
          let best: { emp: RosterEntry; score: number } | null = null;
          for (const emp of roster) {
            const s = compareFaces(det.descriptor, emp.face_descriptor);
            if (!best || s > best.score) best = { emp, score: s };
          }
          if (!best || best.score < MATCH_THRESHOLD) {
            if (attempts > 40) throw new Error('Não foi possível reconhecer. Tente novamente.');
            return;
          }
          clearInterval(scanTimerRef.current); scanTimerRef.current = null;
          stopCamera();
          setCandidate(best.emp);
          setCandidateScore(best.score);
          setStep('confirm');
        } catch (err: any) {
          clearInterval(scanTimerRef.current); scanTimerRef.current = null;
          stopCamera();
          setMessage(err.message || 'Falha no reconhecimento');
          setStep('error'); setTimeout(reset, 2500);
        }
      }, 400);
    } catch (err: any) {
      setMessage('Câmera indisponível: ' + err.message);
      setStep('error'); setTimeout(reset, 3000);
    }
  };

  const confirmPunch = async () => {
    if (!candidate) return;
    setBusy(true);
    try {
      const result = await apiCall('/api/rh/totem/punch', {
        employee_id: candidate.employee_id,
        face_match_score: candidateScore || null,
      });
      setLastPunch(result.punch);
      setStep('success');
      setTimeout(reset, 4000);
    } catch (err: any) {
      setMessage(err.message);
      setStep('error'); setTimeout(reset, 3000);
    } finally { setBusy(false); }
  };

  // ==== CPF flow (biometria OFF) ====
  const lookupCPF = async () => {
    const digits = cpf.replace(/\D/g, '');
    if (digits.length !== 11) return;
    setBusy(true);
    try {
      const emp = await apiCall('/api/rh/totem/lookup', { cpf: digits });
      const result = await apiCall('/api/rh/totem/punch', { employee_id: emp.employee_id });
      setCandidate({ employee_id: emp.employee_id, full_name: emp.full_name, face_photo_url: emp.face_photo_url, face_descriptor: [] });
      setLastPunch(result.punch);
      setStep('success');
      setTimeout(reset, 4000);
    } catch (err: any) {
      setMessage(err.message);
      setStep('error');
      setTimeout(reset, 3000);
    } finally { setBusy(false); }
  };

  const pressKey = (k: string) => {
    if (k === '⌫') setCpf(c => formatCPF(c.replace(/\D/g,'').slice(0, -1)));
    else if (k === 'OK') lookupCPF();
    else setCpf(c => formatCPF((c.replace(/\D/g,'') + k).slice(0, 11)));
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="p-8 max-w-md text-center">
          <XCircle className="h-12 w-12 mx-auto text-destructive mb-3" />
          <h2 className="text-xl font-bold mb-2">Totem não configurado</h2>
          <p className="text-sm text-muted-foreground">Acesse este dispositivo pelo link gerado no painel RH → Totem.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-primary/10 via-background to-primary/5 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Registro de Ponto</h1>
          <p className="text-sm text-muted-foreground">
            {now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <div className="text-right">
          <div className="text-4xl font-bold tabular-nums flex items-center gap-2">
            <Clock className="h-8 w-8 text-primary" />
            {now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex items-center justify-center p-6">
        {step === 'idle' && requireFace && (
          <Card className="p-10 w-full max-w-md text-center">
            <Fingerprint className="h-20 w-20 mx-auto text-primary mb-4" />
            <h2 className="text-2xl font-bold mb-2">Pronto para bater seu ponto?</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Toque no botão abaixo e olhe para a câmera. Vamos reconhecer você automaticamente.
            </p>
            <Button size="lg" className="w-full h-16 text-xl" onClick={startFaceFlow} disabled={!modelsReady}>
              {!modelsReady ? <><Loader2 className="h-5 w-5 mr-2 animate-spin" />Preparando...</> : <><Camera className="h-6 w-6 mr-2" />Bater Ponto</>}
            </Button>
          </Card>
        )}

        {step === 'cpf' && (
          <Card className="p-8 w-full max-w-md">
            <div className="text-center mb-6">
              <User className="h-12 w-12 mx-auto text-primary mb-2" />
              <h2 className="text-xl font-bold">Digite seu CPF</h2>
            </div>
            <Input
              value={cpf}
              onChange={e => setCpf(formatCPF(e.target.value))}
              className="text-3xl text-center h-16 mb-4 tabular-nums"
              placeholder="000.000.000-00"
              autoFocus
            />
            <div className="grid grid-cols-3 gap-2">
              {[...KEYS.slice(0,9), '⌫', '0', 'OK'].map(k => (
                <Button key={k} size="lg" variant={k === 'OK' ? 'default' : 'outline'}
                  className="h-14 text-xl" onClick={() => pressKey(k)}
                  disabled={busy || (k === 'OK' && cpf.replace(/\D/g,'').length !== 11)}>
                  {busy && k === 'OK' ? <Loader2 className="h-5 w-5 animate-spin" /> : k}
                </Button>
              ))}
            </div>
          </Card>
        )}

        {step === 'scanning' && (
          <Card className="p-6 w-full max-w-md text-center">
            <h2 className="text-xl font-bold mb-2">Reconhecendo...</h2>
            <p className="text-sm text-muted-foreground mb-4">Olhe para a câmera</p>
            <div className="relative rounded-2xl overflow-hidden bg-black mb-4">
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-80 object-cover" />
              <div className="absolute inset-4 border-4 border-primary/50 rounded-full pointer-events-none animate-pulse" />
            </div>
            <Button variant="outline" size="sm" onClick={reset}>Cancelar</Button>
          </Card>
        )}

        {step === 'confirm' && candidate && (
          <Card className="p-8 w-full max-w-md text-center">
            {candidate.face_photo_url ? (
              <img src={candidate.face_photo_url} alt={candidate.full_name}
                className="h-32 w-32 rounded-full object-cover mx-auto mb-4 border-4 border-primary/40" />
            ) : (
              <div className="h-32 w-32 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <User className="h-16 w-16 text-primary" />
              </div>
            )}
            <h2 className="text-2xl font-bold">{candidate.full_name}</h2>
            {candidateScore !== null && (
              <p className="text-xs text-muted-foreground mt-1">Similaridade: {candidateScore.toFixed(0)}%</p>
            )}
            <p className="text-sm text-muted-foreground mt-3 mb-6">É você? Confirme para registrar seu ponto.</p>
            <div className="flex gap-3">
              <Button variant="outline" size="lg" className="flex-1 h-14" onClick={reset} disabled={busy}>
                Não sou eu
              </Button>
              <Button size="lg" className="flex-1 h-14" onClick={confirmPunch} disabled={busy}>
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <><CheckCircle2 className="h-5 w-5 mr-2" />Confirmar</>}
              </Button>
            </div>
          </Card>
        )}

        {step === 'success' && lastPunch && (
          <Card className="p-8 w-full max-w-md text-center">
            <CheckCircle2 className="h-20 w-20 mx-auto text-green-600 mb-4" />
            <h2 className="text-2xl font-bold mb-1">Obrigado, {candidate?.full_name?.split(' ')[0]}!</h2>
            <p className="text-lg text-muted-foreground mb-4">Ponto registrado com sucesso</p>
            <div className="bg-muted/50 rounded-xl p-4">
              <p className="text-sm text-muted-foreground">Tipo</p>
              <p className="text-xl font-bold">{PUNCH_LABELS[lastPunch.punch_type] || lastPunch.punch_type}</p>
              <p className="text-3xl font-bold tabular-nums mt-2">
                {new Date(lastPunch.punched_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
            <p className="text-xs text-muted-foreground mt-4">Bom trabalho! 👋</p>
          </Card>
        )}

        {step === 'error' && (
          <Card className="p-8 w-full max-w-md text-center">
            <XCircle className="h-20 w-20 mx-auto text-destructive mb-4" />
            <p className="text-lg font-medium">{message}</p>
          </Card>
        )}
      </div>

      <div className="p-4 text-center text-xs text-muted-foreground">
        Sistema de ponto conforme Portaria MTE 671/2021 · REP-P
      </div>
    </div>
  );
}
