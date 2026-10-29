'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Camera, CameraOff, CheckCircle2, AlertTriangle, XCircle, HeartPulse, ScanLine, Volume2, VolumeX, UserX } from 'lucide-react';
import { toast } from 'sonner';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import { memberPhotoUrl } from '@/lib/storage';
import { humanizeError } from '@/lib/errors';
import { cn, formatDate, formatDateTime, formatMoney } from '@/lib/utils';
import { useUiStore } from '@/stores/ui-store';
import { useCurrency } from '@/stores/session-store';
import type { CheckinResponse, CheckinResult } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/feedback';

const RESET_MS = 6000;

interface BarcodeDetectorLike {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>>;
}
type BarcodeDetectorCtor = new (opts: { formats: string[] }) => BarcodeDetectorLike;

interface RecentEntry {
  id: string;
  name: string;
  result: CheckinResponse['result'];
  at: string;
}

/** Tonos distintos por resultado usando Web Audio (sin archivos externos). */
function playTone(result: CheckinResponse['result']) {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const notes: Record<string, number[]> = {
      granted: [880, 1320],
      warning: [660, 660],
      denied: [220, 180],
      not_found: [300, 200],
    };
    const seq = notes[result] ?? [440];
    seq.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = result === 'granted' ? 'sine' : 'square';
      osc.frequency.value = freq;
      const start = ctx.currentTime + i * 0.16;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.14);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.15);
    });
    setTimeout(() => void ctx.close(), 800);
  } catch {
    // Audio no disponible: se ignora
  }
}

const VISUAL: Record<
  CheckinResponse['result'],
  { bg: string; ring: string; icon: typeof CheckCircle2; label: string; text: string }
> = {
  granted: { bg: 'bg-ok-soft', ring: 'ring-ok', icon: CheckCircle2, label: 'ACCESO AUTORIZADO', text: 'text-ok' },
  warning: { bg: 'bg-warn-soft', ring: 'ring-warn', icon: AlertTriangle, label: 'ACCESO CON ALERTA', text: 'text-warn' },
  denied: { bg: 'bg-danger-soft', ring: 'ring-danger', icon: XCircle, label: 'ACCESO DENEGADO', text: 'text-danger' },
  not_found: { bg: 'bg-surface-2', ring: 'ring-line', icon: UserX, label: 'NO ENCONTRADO', text: 'text-muted' },
};

export function CheckinTerminal() {
  const currency = useCurrency();
  const soundEnabled = useUiStore((s) => s.soundEnabled);
  const setSoundEnabled = useUiStore((s) => s.setSoundEnabled);
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const busyRef = useRef(false);
  const lastScanRef = useRef<{ value: string; at: number }>({ value: '', at: 0 });
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CheckinResponse | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [recent, setRecent] = useState<RecentEntry[]>([]);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraSupported, setCameraSupported] = useState(false);

  useEffect(() => {
    setCameraSupported(typeof window !== 'undefined' && 'BarcodeDetector' in window && !!navigator.mediaDevices);
    inputRef.current?.focus();
  }, []);

  // Reinicia la pantalla tras unos segundos para el siguiente socio
  useEffect(() => {
    if (!result) return;
    const t = setTimeout(() => {
      setResult(null);
      setPhoto(null);
      inputRef.current?.focus();
    }, RESET_MS);
    return () => clearTimeout(t);
  }, [result]);

  const submitIdentifier = useCallback(
    async (raw: string) => {
      const identifier = raw.trim();
      if (!identifier || busyRef.current) return;
      busyRef.current = true;
      setLoading(true);
      const t0 = performance.now();
      const supabase = getSupabaseBrowser();
      const { data, error } = await supabase.rpc('check_in', { p_identifier: identifier });
      setElapsed(Math.round(performance.now() - t0));
      busyRef.current = false;
      setLoading(false);
      setValue('');

      if (error) {
        toast.error(humanizeError(error));
        inputRef.current?.focus();
        return;
      }
      const res = data as CheckinResponse;
      setResult(res);
      setPhoto(null);
      if (soundEnabled) playTone(res.result);
      if ('vibrate' in navigator) navigator.vibrate(res.result === 'granted' ? 60 : [80, 60, 80]);
      setRecent((prev) =>
        [{ id: crypto.randomUUID(), name: `${res.full_name ?? identifier}${res.repeat ? ' · repetido' : ''}`, result: res.result, at: new Date().toISOString() }, ...prev].slice(0, 12),
      );
      if (res.photo_path) {
        void memberPhotoUrl(supabase, res.photo_path).then(setPhoto);
      }
      inputRef.current?.focus();
    },
    [soundEnabled],
  );

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void submitIdentifier(value);
  };

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  const startCamera = async () => {
    const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
    if (!Detector) {
      toast.error('Este navegador no soporta lectura de QR por cámara. Usa un lector USB o digita el DNI.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      streamRef.current = stream;
      setCameraOn(true);
      const detector = new Detector({ formats: ['qr_code'] });
      requestAnimationFrame(async function loop() {
        if (streamRef.current !== stream) return;
        const video = videoRef.current;
        // El <video> se monta tras setCameraOn(true): si aún no existe, reintentar en el siguiente ciclo
        if (!video) {
          setTimeout(() => requestAnimationFrame(loop), 100);
          return;
        }
        if (video.srcObject !== stream) {
          video.srcObject = stream;
          await video.play().catch(() => undefined);
        }
        if (video.readyState >= 2 && !busyRef.current) {
          try {
            const codes = await detector.detect(video);
            const raw = codes[0]?.rawValue;
            const now = Date.now();
            // Evita lecturas duplicadas del mismo QR durante unos segundos
            if (raw && (raw !== lastScanRef.current.value || now - lastScanRef.current.at > RESET_MS)) {
              lastScanRef.current = { value: raw, at: now };
              await submitIdentifier(raw);
            }
          } catch {
            // Frame no procesable: continuar
          }
        }
        setTimeout(() => requestAnimationFrame(loop), 250);
      });
    } catch {
      toast.error('No se pudo acceder a la cámara. Revisa los permisos del navegador.');
      stopCamera();
    }
  };

  const visual = result ? VISUAL[result.result] : null;

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        <form onSubmit={onSubmit} className="rounded-2xl border border-line bg-surface p-4 shadow-xs md:p-6">
          <label htmlFor="checkin-input" className="mb-2 block text-sm font-medium text-muted">
            Escanea el QR del socio o digita su DNI y presiona Enter
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <ScanLine className="pointer-events-none absolute left-4 top-1/2 h-6 w-6 -translate-y-1/2 text-muted" />
              <input
                id="checkin-input"
                ref={inputRef}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                inputMode="numeric"
                maxLength={64}
                placeholder="DNI o código QR"
                className="h-16 w-full rounded-xl border border-line bg-canvas pl-14 pr-4 font-mono text-2xl tracking-wider text-ink placeholder:font-sans placeholder:text-base placeholder:tracking-normal placeholder:text-muted/60 focus:border-olive focus:outline-hidden focus:ring-4 focus:ring-olive/20"
              />
            </div>
            <Button type="submit" size="lg" className="h-16 px-8 text-lg" loading={loading}>
              Validar
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
            <span>{elapsed !== null ? `Última validación: ${elapsed} ms` : 'Compatible con lectores USB tipo teclado'}</span>
            <div className="flex gap-1">
              {cameraSupported && (
                <Button type="button" variant="ghost" size="sm" onClick={cameraOn ? stopCamera : startCamera}>
                  {cameraOn ? <CameraOff className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
                  {cameraOn ? 'Apagar cámara' : 'Usar cámara'}
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSoundEnabled(!soundEnabled)}
                aria-label={soundEnabled ? 'Silenciar alertas' : 'Activar sonido'}
              >
                {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                Sonido
              </Button>
            </div>
          </div>
          {cameraOn && (
            <video ref={videoRef} muted playsInline className="mt-4 aspect-video w-full max-w-md rounded-xl border border-line bg-black object-cover" />
          )}
        </form>

        <div
          aria-live="assertive"
          className={cn(
            'flex min-h-[320px] items-center justify-center rounded-2xl border-2 p-6 transition-colors md:p-10',
            visual ? cn(visual.bg, 'border-transparent ring-4', visual.ring) : 'border-dashed border-line bg-surface',
          )}
        >
          {!result || !visual ? (
            <div className="text-center text-muted">
              <ScanLine className="mx-auto mb-3 h-12 w-12" strokeWidth={1.25} />
              <p className="font-display text-lg">Esperando lectura…</p>
            </div>
          ) : (
            <div className="flex w-full animate-pop-in flex-col items-center gap-6 text-center md:flex-row md:text-left">
              {result.result !== 'not_found' ? (
                <Avatar src={photo} name={result.full_name ?? '?'} size={160} />
              ) : (
                <visual.icon className={cn('h-28 w-28', visual.text)} strokeWidth={1.25} />
              )}
              <div className="min-w-0 flex-1">
                <p className={cn('flex items-center justify-center gap-2 font-display text-sm font-bold tracking-[0.2em] md:justify-start', visual.text)}>
                  <visual.icon className="h-5 w-5" /> {visual.label}
                </p>
                <p className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink md:text-5xl">
                  {result.full_name ?? 'Sin coincidencias'}
                </p>
                <p className={cn('mt-2 text-lg font-medium', visual.text)}>{result.reason}</p>
                {result.result !== 'not_found' && (
                  <div className="mt-4 flex flex-wrap justify-center gap-x-6 gap-y-1 text-sm text-ink/80 md:justify-start">
                    {result.plan_name && <span>Plan: {result.plan_name}</span>}
                    {result.end_date && <span>Vence: {formatDate(result.end_date)}</span>}
                    {typeof result.days_left === 'number' && (
                      <span className="font-semibold">
                        {result.days_left >= 0 ? `${result.days_left} día(s) restantes` : `Vencida hace ${-result.days_left} día(s)`}
                      </span>
                    )}
                    {typeof result.class_credits_left === 'number' && (
                      <span className={cn('font-semibold', result.class_credits_left === 0 && 'text-danger')}>
                        {result.class_credits_left} clase(s) disponible(s)
                      </span>
                    )}
                    {!!result.debt && result.debt > 0 && <span className="font-semibold text-danger">Deuda: {formatMoney(result.debt, currency)}</span>}
                  </div>
                )}
                {result.medical_notes && (
                  <p className="mt-4 inline-flex items-start gap-2 rounded-lg bg-surface/70 px-3 py-2 text-left text-sm">
                    <HeartPulse className="mt-0.5 h-4 w-4 shrink-0 text-copper" /> {result.medical_notes}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <aside className="rounded-2xl border border-line bg-surface shadow-xs">
        <div className="border-b border-line px-4 py-3">
          <h2 className="font-display text-sm font-semibold">Lecturas de este turno</h2>
        </div>
        {recent.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted">Las validaciones aparecerán aquí.</p>
        ) : (
          <ul className="divide-y divide-line">
            {recent.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{r.name}</p>
                  <p className="text-xs text-muted">{formatDateTime(r.at)}</p>
                </div>
                <ResultDot result={r.result} />
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}

function ResultDot({ result }: { result: CheckinResult | 'not_found' }) {
  const cls = { granted: 'bg-ok', warning: 'bg-warn', denied: 'bg-danger', not_found: 'bg-muted' }[result];
  return <span className={cn('h-3 w-3 shrink-0 rounded-full', cls)} aria-label={VISUAL[result].label} />;
}
