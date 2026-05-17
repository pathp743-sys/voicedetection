'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import AppLayout from '@/components/AppLayout'
import { Mic, MicOff, Upload, Radio, CheckCircle, Info } from 'lucide-react'

interface DroneResult {
  detected: boolean
  confidence: number
  fundamentalHz: number
  harmonics: number[]
  harmonicStrength: number
  snr: number
  model: string
  distance: number | null
  allCandidates: { freq: number; score: number; harmonics: number[] }[]
  analysis: string
  timestamp: string
}

const DISPLAY_BARS = 80
const FFT_SIZE = 8192  // High resolution for precise frequency detection

export default function DronePage() {
  const [mode, setMode] = useState<'live' | 'file'>('live')
  const [isListening, setIsListening] = useState(false)
  const [listenSecs, setListenSecs] = useState(0)
  const [hasCapture, setHasCapture] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<DroneResult | null>(null)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [bars, setBars] = useState<number[]>(Array(DISPLAY_BARS).fill(2))
  const [capturedFft, setCapturedFft] = useState<number[]>([])
  const [peakFreq, setPeakFreq] = useState<number | null>(null)

  const streamRef  = useRef<MediaStream | null>(null)
  const ctxRef     = useRef<AudioContext | null>(null)
  const animRef    = useRef<number | null>(null)
  const timerRef   = useRef<ReturnType<typeof setInterval> | null>(null)
  const accRef     = useRef<number[]>([])
  const frameRef   = useRef(0)
  const fileRef    = useRef<HTMLInputElement>(null)

  const stopAll = useCallback(() => {
    if (animRef.current) cancelAnimationFrame(animRef.current)
    if (timerRef.current) clearInterval(timerRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    ctxRef.current?.close()
    streamRef.current = null; ctxRef.current = null
  }, [])
  useEffect(() => () => stopAll(), [stopAll])

  async function startListening() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 44100, channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        video: false,
      })
      streamRef.current = stream
      const ctx = new AudioContext({ sampleRate: 44100 })
      ctxRef.current = ctx
      const analyser = ctx.createAnalyser()
      analyser.fftSize = FFT_SIZE
      analyser.smoothingTimeConstant = 0.0  // No smoothing for raw data
      ctx.createMediaStreamSource(stream).connect(analyser)

      accRef.current = new Array(FFT_SIZE / 2).fill(0)
      frameRef.current = 0

      const data = new Float32Array(analyser.frequencyBinCount)
      setIsListening(true); setHasCapture(false); setListenSecs(0); setResult(null); setPeakFreq(null)
      timerRef.current = setInterval(() => setListenSecs(s => s + 1), 1000)

      const draw = () => {
        analyser.getFloatFrequencyData(data)
        // dB to linear: dBFS range is -100 to 0
        const lin = Array.from(data).map(db => {
          const v = Math.max(0, (db + 100) / 100)
          return Math.min(1, v)
        })
        // Accumulate frames for averaging
        for (let i = 0; i < lin.length; i++) accRef.current[i] += lin[i]
        frameRef.current++

        // Display bars (focus on 0–1000 Hz range where drones live)
        const focusBins = Math.round(1000 / (44100 / 2 / (FFT_SIZE / 2)))
        const step = Math.floor(focusBins / DISPLAY_BARS)
        setBars(Array(DISPLAY_BARS).fill(0).map((_, i) => {
          const s = i * step, e = s + step
          return Math.round(Math.max(...lin.slice(s, e)) * 100)
        }))

        // Show peak frequency
        const peakBin = lin.slice(0, focusBins).indexOf(Math.max(...lin.slice(0, focusBins)))
        setPeakFreq(Math.round(peakBin * 44100 / 2 / (FFT_SIZE / 2)))

        animRef.current = requestAnimationFrame(draw)
      }
      draw()
    } catch { alert('Mikrofon-Zugriff verweigert.') }
  }

  function stopListening() {
    const frames = frameRef.current || 1
    const avg = accRef.current.map(v => v / frames)
    setCapturedFft(avg)
    // Update display with averaged data
    const focusBins = Math.round(1000 / (44100 / 2 / (FFT_SIZE / 2)))
    const step = Math.floor(focusBins / DISPLAY_BARS)
    setBars(Array(DISPLAY_BARS).fill(0).map((_, i) => {
      const s = i * step, e = s + step
      return Math.round(Math.max(...avg.slice(s, e)) * 100)
    }))
    stopAll(); setIsListening(false); setHasCapture(true)
  }

  async function extractFftFromFile(file: File): Promise<number[]> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = async e => {
        try {
          const buf = e.target?.result as ArrayBuffer
          const decoded = await new AudioContext().decodeAudioData(buf.slice(0))
          // Resample to 44100 if needed
          const data = decoded.getChannelData(0)
          const fftSz = FFT_SIZE
          const numFrames = Math.min(200, Math.floor(data.length / fftSz))
          const acc = new Float64Array(fftSz / 2)
          let frames = 0

          for (let f = 0; f < numFrames; f++) {
            const start = f * fftSz
            // Apply Hann window
            const windowed = new Float64Array(fftSz)
            for (let i = 0; i < fftSz; i++) {
              const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / fftSz)
              windowed[i] = (data[start + i] || 0) * w
            }
            // Compute magnitude spectrum via DFT (sampled for speed)
            const subsample = 8
            for (let k = 0; k < fftSz / 2; k++) {
              let re = 0, im = 0
              for (let n = 0; n < fftSz; n += subsample) {
                const angle = -2 * Math.PI * k * n / fftSz
                re += windowed[n] * Math.cos(angle)
                im += windowed[n] * Math.sin(angle)
              }
              const mag = Math.sqrt(re * re + im * im) / (fftSz / subsample)
              acc[k] += mag
            }
            frames++
          }

          const result = Array.from(acc).map(v => v / frames)
          // Normalize to 0-1
          const maxVal = Math.max(...result) || 1
          resolve(result.map(v => v / maxVal))
        } catch (err) { reject(err) }
      }
      reader.onerror = reject
      reader.readAsArrayBuffer(file)
    })
  }

  async function analyze() {
    setLoading(true)
    try {
      let fftToSend = capturedFft
      let isFile = false

      if (mode === 'file' && uploadFile) {
        isFile = true
        fftToSend = await extractFftFromFile(uploadFile)
        // Update display
        const focusBins = Math.round(1000 / (44100 / 2 / (FFT_SIZE / 2)))
        const step = Math.floor(focusBins / DISPLAY_BARS)
        setBars(Array(DISPLAY_BARS).fill(0).map((_, i) => {
          const s = i * step, e = s + step
          return Math.round(Math.max(...fftToSend.slice(s, e)) * 100)
        }))
      }

      if (fftToSend.length === 0) { alert('Bitte zuerst aufnehmen oder Datei hochladen.'); setLoading(false); return }

      const res = await fetch('/api/acoustic-drone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fftData: fftToSend,
          sampleRate: 44100,
          isLive: !isFile,
          fileName: uploadFile?.name || null,
          durationSeconds: listenSecs,
        }),
      })
      const data: DroneResult = await res.json()
      setResult(data)
    } catch (e) { alert('Fehler: ' + e) }
    setLoading(false)
  }

  // Color bars: highlight 50-150 Hz range (drone BPF zone)
  // In our 0-1000 Hz display: drone zone = bins 0-12 (15% of display)
  const getDroneBarColor = (i: number, h: number) => {
    const freqHz = (i / DISPLAY_BARS) * 1000
    const inDroneZone = freqHz >= 50 && freqHz <= 200
    if (h > 70 && inDroneZone) return 'var(--red)'
    if (h > 40 && inDroneZone) return '#f97316'
    if (inDroneZone) return 'var(--blue)'
    if (h > 60) return '#6b7280'
    return '#1e1e30'
  }

  return (
    <AppLayout>
      <div className="p-4 md:p-8 max-w-2xl mx-auto">
        <div className="mb-5 fade-up">
          <h1 style={{ fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 'clamp(22px,5vw,32px)', letterSpacing: '-0.03em' }} className="text-white">
            Drohnenerkennung
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
            Harmonik-Analyse · Drohnen-BPF 50–150 Hz
          </p>
        </div>

        {/* Info */}
        <div className="card p-4 mb-4 fade-up-1" style={{ border: '1px solid rgba(37,99,235,0.2)', background: 'rgba(37,99,235,0.04)' }}>
          <div className="flex gap-3">
            <Info size={14} style={{ color: 'var(--blue)', flexShrink: 0, marginTop: 2 }} />
            <div className="text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
              Drohnen erzeugen periodische Harmonische bei <span style={{ color: 'var(--blue)' }}>f₀, 2×f₀, 3×f₀, 4×f₀</span>.
              Der Algorithmus sucht genau nach diesem Muster im Bereich 50–150 Hz.
              <strong className="text-white"> WAV-Dateien</strong> geben die besten Ergebnisse (MP3 komprimiert Frequenzen weg).
              Mindestens <strong className="text-white">5 Sekunden</strong> Drohnengeräusch aufnehmen.
            </div>
          </div>
        </div>

        {/* Mode tabs */}
        <div className="flex gap-1 p-1 rounded-2xl mb-4 fade-up-1" style={{ background: 'var(--surface)' }}>
          {[{ id: 'live' as const, icon: Mic, label: 'Live-Mikrofon' }, { id: 'file' as const, icon: Upload, label: 'WAV / MP3 hochladen' }].map(m => (
            <button key={m.id}
              onClick={() => { setMode(m.id); stopAll(); setIsListening(false); setHasCapture(false); setUploadFile(null); setResult(null); setBars(Array(DISPLAY_BARS).fill(2)); setCapturedFft([]) }}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold transition-all"
              style={{ background: mode === m.id ? 'rgba(37,99,235,0.2)' : 'transparent', color: mode === m.id ? 'var(--blue)' : 'var(--muted)', border: mode === m.id ? '1px solid rgba(37,99,235,0.3)' : '1px solid transparent' }}>
              <m.icon size={13} />{m.label}
            </button>
          ))}
        </div>

        {/* FFT Display */}
        <div className="card p-4 mb-4 fade-up-1">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--dimmed)' }}>Frequenzspektrum (0–1000 Hz)</span>
            <div className="flex items-center gap-3 text-xs">
              {peakFreq !== null && isListening && (
                <span style={{ color: 'var(--blue)' }}>Peak: <strong>{peakFreq}Hz</strong></span>
              )}
              <span style={{ color: 'rgba(37,99,235,0.6)' }}>🔵 50–200Hz</span>
            </div>
          </div>
          <div className="rounded-xl flex items-end gap-[1px] px-2 py-2 overflow-hidden" style={{ height: 88, background: '#06060f' }}>
            {bars.map((h, i) => (
              <div key={i} className="flex-1 rounded-t-sm"
                style={{ height: `${Math.max(2, h)}%`, background: getDroneBarColor(i, h), transitionDuration: isListening ? '80ms' : '400ms', transition: 'height, background' }} />
            ))}
          </div>
          <div className="flex justify-between text-xs mt-1 px-1" style={{ color: 'var(--dimmed)' }}>
            <span>0 Hz</span>
            <span style={{ color: 'rgba(37,99,235,0.5)' }}>← Drohnen-BPF Bereich →</span>
            <span>1000 Hz</span>
          </div>
        </div>

        {/* Controls */}
        <div className="card p-5 mb-4 fade-up-2 space-y-3">
          {mode === 'live' ? (
            <>
              {isListening && (
                <div className="text-center">
                  <div className="text-2xl font-mono font-bold text-white">
                    {String(Math.floor(listenSecs / 60)).padStart(2, '0')}:{String(listenSecs % 60).padStart(2, '0')}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: listenSecs < 5 ? 'var(--amber)' : 'var(--green)' }}>
                    {listenSecs < 5 ? `Noch ${5 - listenSecs}s aufnehmen…` : 'Genug — kannst stoppen oder weitermachen'}
                  </div>
                </div>
              )}
              {!isListening && hasCapture && (
                <div className="text-xs text-center flex items-center justify-center gap-1.5" style={{ color: 'var(--green)' }}>
                  <CheckCircle size={13} />{listenSecs}s aufgenommen · bereit zur Analyse
                </div>
              )}
              <button onClick={isListening ? stopListening : startListening}
                className="w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all"
                style={isListening
                  ? { background: 'rgba(239,68,68,0.15)', color: 'var(--red)', border: '1px solid rgba(239,68,68,0.3)' }
                  : { background: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid var(--border2)' }}>
                {isListening ? <><MicOff size={15} />Aufnahme stoppen</> : <><Mic size={15} />Mikrofon starten</>}
              </button>
            </>
          ) : (
            <div onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-2 py-6 cursor-pointer transition-all"
              style={{ borderColor: 'var(--border2)', background: 'rgba(255,255,255,0.02)' }}>
              <input ref={fileRef} type="file" accept=".mp3,.wav,.ogg,.flac,.m4a,.aac" className="hidden"
                onChange={e => { if (e.target.files?.[0]) { setUploadFile(e.target.files[0]); setResult(null); setHasCapture(true) } }} />
              {uploadFile
                ? <><CheckCircle size={20} style={{ color: 'var(--blue)' }} /><span className="text-sm text-white truncate max-w-full px-4">{uploadFile.name}</span><span className="text-xs" style={{ color: 'var(--dimmed)' }}>FFT wird extrahiert</span></>
                : <><Upload size={20} style={{ color: 'var(--dimmed)' }} /><span className="text-sm font-medium" style={{ color: 'var(--muted)' }}>Drohnen-Audio hochladen</span><span className="text-xs" style={{ color: 'var(--dimmed)' }}>WAV empfohlen · MP3/OGG/FLAC auch ok</span></>}
            </div>
          )}

          <button onClick={analyze} disabled={!hasCapture || loading}
            className="w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all"
            style={{ background: 'rgba(37,99,235,0.2)', color: 'var(--blue)', border: '1px solid rgba(37,99,235,0.3)', opacity: (!hasCapture || loading) ? 0.4 : 1 }}>
            {loading
              ? <><div className="w-4 h-4 rounded-full border-2 spin" style={{ borderColor: 'rgba(37,99,235,0.3)', borderTopColor: 'var(--blue)' }} />Analysiere Harmonische…</>
              : <><Radio size={15} />Drohne erkennen</>}
          </button>
        </div>

        {/* Result */}
        {result && (
          <div className="fade-up space-y-4">
            {/* Verdict */}
            <div className="card p-6 text-center"
              style={{ border: `1px solid ${result.detected ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)'}`, background: result.detected ? 'rgba(239,68,68,0.06)' : 'rgba(16,185,129,0.06)' }}>
              <div style={{ fontSize: 52, lineHeight: 1, marginBottom: 10 }}>{result.detected ? '🚨' : '✅'}</div>
              <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 'clamp(24px,6vw,34px)', letterSpacing: '-0.03em', color: result.detected ? 'var(--red)' : 'var(--green)' }}>
                {result.detected ? 'DROHNE ERKANNT' : 'KEINE DROHNE'}
              </div>
              {result.detected && (
                <div className="text-sm font-medium mt-1 text-white">{result.model}</div>
              )}
              <div className="text-sm mt-1" style={{ color: 'var(--muted)' }}>{result.confidence}% Konfidenz</div>
              <div className="mt-4 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                <div className="h-full rounded-full" style={{ width: `${result.confidence}%`, background: result.detected ? 'var(--red)' : 'var(--green)' }} />
              </div>
            </div>

            {/* Acoustic details */}
            <div className="card p-5">
              <div className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--dimmed)' }}>Akustische Analyse</div>
              <div className="grid grid-cols-2 gap-3 mb-4">
                {[
                  { l: 'Grundfrequenz (BPF)', v: result.fundamentalHz ? `${result.fundamentalHz} Hz` : '—' },
                  { l: 'Harmonik-Score', v: result.harmonicStrength.toFixed(3) },
                  { l: 'SNR', v: result.snr + ' dB' },
                  { l: 'Distanz (geschätzt)', v: result.distance ? `~${result.distance}m` : '—' },
                ].map(m => (
                  <div key={m.l} className="p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)' }}>
                    <div className="text-xs mb-0.5" style={{ color: 'var(--dimmed)' }}>{m.l}</div>
                    <div className="text-sm font-mono font-semibold text-white">{m.v}</div>
                  </div>
                ))}
              </div>

              {/* Harmonics */}
              {result.harmonics.length > 0 && (
                <div>
                  <div className="text-xs mb-2" style={{ color: 'var(--dimmed)' }}>Erkannte Harmonische</div>
                  <div className="flex gap-2 flex-wrap">
                    {result.harmonics.map((h, i) => (
                      <div key={i} className="px-3 py-1.5 rounded-lg text-xs font-mono font-semibold"
                        style={{ background: 'rgba(239,68,68,0.12)', color: 'var(--red)', border: '1px solid rgba(239,68,68,0.25)' }}>
                        {h}Hz {i === 0 ? '(BPF)' : `(${i + 1}×)`}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Other candidates */}
              {result.allCandidates.length > 1 && (
                <div className="mt-4">
                  <div className="text-xs mb-2" style={{ color: 'var(--dimmed)' }}>Weitere Kandidaten</div>
                  <div className="space-y-1.5">
                    {result.allCandidates.slice(1, 4).map((c, i) => (
                      <div key={i} className="flex justify-between items-center text-xs px-3 py-1.5 rounded-lg"
                        style={{ background: 'rgba(255,255,255,0.03)' }}>
                        <span style={{ color: 'var(--muted)' }}>{c.freq}Hz · {c.harmonics.length} Harmonische</span>
                        <span className="font-mono" style={{ color: 'var(--dimmed)' }}>{c.score.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* AI analysis */}
            <div className="card p-4" style={{ background: 'rgba(255,255,255,0.02)' }}>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>{result.analysis}</p>
            </div>
          </div>
        )}

        <div className="mt-4 text-xs text-center" style={{ color: 'var(--dimmed)' }}>
          Pixabay → "DJI drone flying" → WAV herunterladen → hochladen
        </div>
      </div>
    </AppLayout>
  )
}
