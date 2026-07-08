/**
 * Totem de Ponto — Fullscreen kiosk page
 * URL: /rh/totem?token=<device_token>
 * Fluxo: CPF -> reconhecimento facial -> registra ponto
 */
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Loader2, Camera, CheckCircle2, XCircle, Clock, User } from "lucide-react";
import { loadFaceModels, detectFace, compareFaces } from "@/lib/facial-recognition";
import { API_URL } from "@/lib/api";

type Step = 'cpf' | 'face' | 'confirm' | 'success' | 'error';

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

export default function RHTotem() {
  const [params] = useSearchParams();
  const token = params.get('token') || localStorage.getItem('totem_token') || '';

  const [step, setStep] = useState<Step>('cpf');
  const [cpf, setCpf] = useState('');
  const [employee, setEmployee] = useState<any>(null);
  const [message, setMessage] = useState('');
  const [now, setNow] = useState(new Date());
  const [busy, setBusy] = useState(false);
  const [modelsReady, setModelsReady] = useState(false);
  const [matchScore, setMatchScore] = useState<number | null>(null);
  const [lastPunch, setLastPunch] = useState<any>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (token) localStorage.setItem('totem_token', token);
    const t = setInterval(() => setNow(new Date()), 1000);
    loadFaceModels().then(() => setModelsReady(true)).catch(() => setModelsReady(false));
    return () => clearInterval(t);
  }, [token]);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  };

  useEffect(() => () => stopCamera(), []);

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

  const lookupCPF = async () => {
    const digits = cpf.replace(/\D/g, '');
    if (digits.length !== 11) return;
    setBusy(true);
    try {
      const emp = await apiCall('/api/rh/totem/lookup', { cpf: digits });
      setEmployee(emp);
      if (emp.require_face && emp.face_descriptor) {
        setStep('face');
        setTimeout(() => startCamera(), 100);
      } else {
        await registerPunch(emp.employee_id);
      }
    } catch (err: any) {
      setMessage(err.message);
      setStep('error');
      setTimeout(reset, 3000);
    } finally { setBusy(false); }
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640, height: 480 } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      // auto-capture after 2s
      setTimeout(() => captureAndVerify(), 2500);
    } catch (err: any) {
      setMessage('Câmera indisponível: ' + err.message);
      setStep('error');
      setTimeout(reset, 3000);
    }
  };

  const captureAndVerify = async () => {
    if (!videoRef.current || !employee) return;
    setBusy(true);
    try {
      const detection = await detectFace(videoRef.current);
      if (!detection || !detection.descriptor) throw new Error('Rosto não detectado. Aproxime-se da câmera.');
      const score = compareFaces(detection.descriptor, employee.face_descriptor);
      setMatchScore(score);
      if (score < 60) throw new Error(`Reconhecimento falhou (${score.toFixed(0)}%). Tente novamente.`);
      stopCamera();
      await registerPunch(employee.employee_id, score);
    } catch (err: any) {
      setMessage(err.message);
      setBusy(false);
      // retry
      setTimeout(() => { if (step === 'face') captureAndVerify(); }, 1500);
    }
  };

  const registerPunch = async (employee_id: string, faceScore?: number) => {
    setBusy(true);
    try {
      const result = await apiCall('/api/rh/totem/punch', {
        employee_id,
        face_match_score: faceScore || null,
      });
      setLastPunch(result.punch);
      setStep('success');
      setTimeout(reset, 4000);
    } catch (err: any) {
      setMessage(err.message);
      setStep('error');
      setTimeout(reset, 3000);
    } finally { setBusy(false); }
  };

  const reset = () => {
    stopCamera();
    setCpf(''); setEmployee(null); setMessage(''); setMatchScore(null); setLastPunch(null);
    setStep('cpf');
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

        {step === 'face' && (
          <Card className="p-6 w-full max-w-md text-center">
            <h2 className="text-xl font-bold mb-2">Olá, {employee?.full_name?.split(' ')[0]}</h2>
            <p className="text-sm text-muted-foreground mb-4">Posicione seu rosto no centro da câmera</p>
            <div className="relative rounded-2xl overflow-hidden bg-black mb-4">
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-72 object-cover" />
              <div className="absolute inset-4 border-4 border-primary/50 rounded-full pointer-events-none" />
              {busy && (
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                  <Loader2 className="h-10 w-10 animate-spin text-white" />
                </div>
              )}
            </div>
            {matchScore !== null && (
              <p className="text-sm">Similaridade: <b>{matchScore.toFixed(0)}%</b></p>
            )}
            {message && <p className="text-sm text-destructive mt-2">{message}</p>}
            <Button variant="outline" size="sm" onClick={reset} className="mt-3">Cancelar</Button>
          </Card>
        )}

        {step === 'success' && lastPunch && (
          <Card className="p-8 w-full max-w-md text-center">
            <CheckCircle2 className="h-20 w-20 mx-auto text-green-600 mb-4" />
            <h2 className="text-2xl font-bold mb-1">{employee?.full_name}</h2>
            <p className="text-lg text-muted-foreground mb-4">Ponto registrado</p>
            <div className="bg-muted/50 rounded-xl p-4">
              <p className="text-sm text-muted-foreground">Tipo</p>
              <p className="text-xl font-bold">{PUNCH_LABELS[lastPunch.punch_type] || lastPunch.punch_type}</p>
              <p className="text-3xl font-bold tabular-nums mt-2">
                {new Date(lastPunch.punched_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
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
