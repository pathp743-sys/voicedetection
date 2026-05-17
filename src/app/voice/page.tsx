'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import AppLayout from '@/components/AppLayout'
import { Mic, MicOff, ShieldCheck, AlertTriangle, Activity, Cpu } from 'lucide-react'

interface VoiceResult {
  isFake: boolean
  fakeScore: number
  confidence: number
  f0: number
  f0Variance: number
  jitter: number
  shimmer: number
  hnr: number
  spectralFlux: number
  zcr: number
  mfccConsistency: number
  pitchContinuity: number
  breathingArtifacts: number
  formantStability: number
  reasons: string[]
  analysis: string
  timestamp: string
}

// Color based on whether value is in "real" or "fake" range
function indicatorColor(label: string, value: number): string {
  switch (label) {
    case 'Jitter':
      return value < 0.08 || value > 1.2 ? '#e24b4a' : '#3b9e75'
    case 'Shimmer':
      return value < 0.08 || value > 1.2 ? '#e24b4a' : '#3b9e75'
    case 'HNR':
      return value > 32 || value < 8 ? '#e24b4a' : '#3b9e75'
    case 'Atemindex':
      return value < 0.08 ? '#e24b4a' : '#3b9e75'
    case 'MFCC':
      return value > 0.93 || value < 0.25 ? '#e24b4a' : '#3b9e75'
    default:
      return '#1a6ef5'
  }
}

export default function VoicePage() {
  const [isRecording, setIsRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [hasRecording, setHasRecording] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<VoiceResult | null>(null)
  const [waveBars, setWaveBars] = useState<number[]>(Array(48).fill(4))
  const [history, setHistory] = useState<VoiceResult[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const waveRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopAll = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (waveRef.current) clearInterval(waveRef.current)
  }, [])
  useEffect(() => () => stopAll(), [stopAll])

  function toggleRecording() {
    if (isRecording) {
      stopAll()
      setIsRecording(false)
      setHasRecording(true)
      setWaveBars(Array(48).fill(4))
    } else {
      setIsRecording(true)
      setSeconds(0)
      setResult(null)
      setHasRecording(false)
      timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000)
      waveRef.current = setInterval(() => {
        setWaveBars(Array(48).fill(0).map(() => Math.floor(Math.random() * 44) + 4))
      }, 100)
    }
  }

  async function analyze() {
    setLoading(true)
    try {
      const res = await fetch('/api/analyze-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ durationSeconds: seconds || 5 }),
      })
      const data: VoiceResult = await res.json()
      setResult(data)
      setHistory(h => [data, ...h].slice(0, 12))
    } catch {
      alert('Fehler bei der Analyse. API-Key prüfen.')
    }
    setLoading(false)
  }

  const totalFake = history.filter(h => h.isFake).length
  const avgConf = history.length
    ? Math.round(history.reduce((a, h) => a + h.confidence, 0) / history.length)
    : 0

  return (
    <AppLayout>
      <div className="p-8 max-w-6xl">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-white">Stimmerkennung</h1>
          <p className="text-white/40 text-sm mt-1">
            Forensische Deepfake-Erkennung · 11 biometrische Merkmale · 
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Analysiert', value: history.length, color: 'text-white' },
            { label: 'Fake erkannt', value: totalFake, color: 'text-[#e24b4a]' },
            { label: 'Echt verifiziert', value: history.length - totalFake, color: 'text-[#3b9e75]' },
            { label: 'Ø Konfidenz', value: history.length ? avgConf + '%' : '—', color: 'text-[#1a6ef5]' },
          ].map(s => (
            <div key={s.label} className="glass-card rounded-xl p-4">
              <div className="text-xs text-white/40 mb-1">{s.label}</div>
              <div className={`text-2xl font-semibold ${s.color}`}>{s.value}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-6">
          {/* Recorder */}
          <div className="glass-card rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-5">
              <Activity size={16} className="text-accent" />
              <span className="text-sm font-medium text-white">Aufnahme</span>
            </div>

            <div className="h-20 bg-white/3 rounded-xl mb-5 flex items-center justify-center gap-[2px] px-4 overflow-hidden relative">
              {waveBars.map((h, i) => (
                <div key={i} className={`wave-bar ${isRecording ? 'active' : ''}`} style={{ height: `${h}px` }} />
              ))}
              {!isRecording && !hasRecording && (
                <span className="absolute text-xs text-white/25">Bereit zur Aufnahme</span>
              )}
            </div>

            {isRecording && (
              <div className="text-center mb-4">
                <span className="text-3xl font-mono text-white">
                  {String(Math.floor(seconds / 60)).padStart(2, '0')}:{String(seconds % 60).padStart(2, '0')}
                </span>
                <div className="flex items-center justify-center gap-1.5 mt-1">
                  <span className="w-2 h-2 rounded-full bg-[#e24b4a] animate-blink" />
                  <span className="text-xs text-[#e24b4a]">Aufnahme läuft</span>
                </div>
              </div>
            )}

            <button onClick={toggleRecording}
              className={`w-full py-3 rounded-xl flex items-center justify-center gap-2.5 font-medium text-sm transition-all mb-3 ${
                isRecording
                  ? 'bg-[#e24b4a]/15 border border-[#e24b4a]/40 text-[#e24b4a] hover:bg-[#e24b4a]/25'
                  : 'bg-white/5 border border-white/12 text-white hover:bg-white/10'
              }`}>
              {isRecording ? <><MicOff size={17} />Aufnahme stoppen</> : <><Mic size={17} />Aufnahme starten</>}
            </button>

            <button onClick={analyze} disabled={!hasRecording || loading}
              className="w-full py-3 rounded-xl flex items-center justify-center gap-2.5 font-medium text-sm bg-accent/15 border border-accent/40 text-accent hover:bg-accent/25 transition-all disabled:opacity-30 disabled:cursor-not-allowed">
              {loading
                ? <><span className="w-4 h-4 border-2 border-accent/30 border-t-accent rounded-full animate-spin-slow" />Analysiere…</>
                : <><Cpu size={17} />Forensische Analyse starten</>}
            </button>

            {/* Legend */}
            <div className="mt-5 pt-4 border-t border-white/8">
              <div className="text-xs text-white/30 mb-2">Indikator-Legende</div>
              <div className="flex gap-4">
                <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#3b9e75]" /><span className="text-xs text-white/40">Normaler Bereich</span></div>
                <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#e24b4a]" /><span className="text-xs text-white/40">Verdächtig</span></div>
                <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#1a6ef5]" /><span className="text-xs text-white/40">Info</span></div>
              </div>
            </div>
          </div>

          {/* Result */}
          <div className="glass-card rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-5">
              <ShieldCheck size={16} className="text-accent" />
              <span className="text-sm font-medium text-white">Forensisches Ergebnis</span>
            </div>

            {!result ? (
              <div className="flex flex-col items-center justify-center h-64 text-white/25 text-sm gap-3">
                <ShieldCheck size={32} className="opacity-20" />
                Noch keine Analyse durchgeführt
              </div>
            ) : (
              <div className="animate-slide-in space-y-4 overflow-y-auto max-h-[600px] pr-1">
                {/* Main verdict */}
                <div className={`rounded-xl p-4 border ${result.isFake ? 'bg-[#e24b4a]/10 border-[#e24b4a]/30' : 'bg-[#3b9e75]/10 border-[#3b9e75]/30'}`}>
                  <div className={`flex items-center gap-2 font-semibold text-lg ${result.isFake ? 'text-[#e24b4a]' : 'text-[#3b9e75]'}`}>
                    {result.isFake ? <AlertTriangle size={20} /> : <ShieldCheck size={20} />}
                    {result.isFake ? 'FAKE — Synthetische Stimme' : 'ECHT — Menschliche Stimme'}
                  </div>
                  <div className="flex gap-4 mt-2 text-sm text-white/50">
                    <span>Konfidenz: <strong className="text-white">{result.confidence}%</strong></span>
                    <span>Fake-Score: <strong className={result.fakeScore >= 40 ? 'text-[#e24b4a]' : 'text-[#3b9e75]'}>{result.fakeScore}/100</strong></span>
                  </div>
                  <div className="mt-3 h-2 bg-white/10 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${result.isFake ? 'bg-[#e24b4a]' : 'bg-[#3b9e75]'}`} style={{ width: `${result.confidence}%` }} />
                  </div>
                </div>

                {/* Biometric indicators */}
                <div>
                  <div className="text-xs text-white/40 uppercase tracking-wider mb-2">Biometrische Indikatoren</div>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { l: 'F0 Grundfrequenz', v: result.f0 + ' Hz', raw: result.f0, label: 'F0' },
                      { l: 'F0 Varianz', v: '±' + result.f0Variance + ' Hz', raw: result.f0Variance, label: 'F0V' },
                      { l: 'Jitter', v: result.jitter.toFixed(4) + '%', raw: result.jitter, label: 'Jitter' },
                      { l: 'Shimmer', v: result.shimmer.toFixed(4) + 'dB', raw: result.shimmer, label: 'Shimmer' },
                      { l: 'HNR', v: result.hnr.toFixed(2) + 'dB', raw: result.hnr, label: 'HNR' },
                      { l: 'Atemgeräusche', v: result.breathingArtifacts.toFixed(4), raw: result.breathingArtifacts, label: 'Atemindex' },
                      { l: 'MFCC-Konsistenz', v: result.mfccConsistency.toFixed(4), raw: result.mfccConsistency, label: 'MFCC' },
                      { l: 'Pitch-Kontinuität', v: result.pitchContinuity.toFixed(4), raw: result.pitchContinuity, label: 'Pitch' },
                    ].map(m => {
                      const color = indicatorColor(m.label, m.raw)
                      return (
                        <div key={m.l} className="bg-white/4 rounded-lg p-2.5 flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                          <div className="flex-1 min-w-0">
                            <div className="text-xs text-white/40 truncate">{m.l}</div>
                            <div className="text-xs font-mono font-medium text-white">{m.v}</div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Suspicious indicators */}
                {result.reasons.length > 0 && (
                  <div>
                    <div className="text-xs text-white/40 uppercase tracking-wider mb-2">Erkennungsmerkmale</div>
                    <div className="space-y-1.5">
                      {result.reasons.map((r, i) => {
                        const isRed = r.includes('zu perfekt') || r.includes('Artefakt') || r.includes('Keine') || r.includes('unnormal') || r.includes('robotisch') || r.includes('synthetisch') || r.includes('abrupt') || r.includes('Inkonsistenz')
                        return (
                          <div key={i} className={`flex items-start gap-2 text-xs px-3 py-2 rounded-lg ${isRed ? 'bg-[#e24b4a]/8 text-[#e24b4a]/80' : 'bg-[#3b9e75]/8 text-[#3b9e75]/80'}`}>
                            <span className="mt-0.5">{isRed ? '⚠' : '✓'}</span>
                            <span>{r}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* AI Analysis */}
                <div className="bg-white/3 rounded-lg p-4 border border-white/8">
                  <div className="text-xs text-accent mb-2 font-medium">KI-Forensik · </div>
                  <p className="text-sm text-white/60 leading-relaxed">{result.analysis}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* History */}
        {history.length > 0 && (
          <div className="mt-6 glass-card rounded-2xl p-6">
            <div className="text-sm font-medium text-white mb-4">Analyse-Verlauf</div>
            <div className="space-y-2">
              {history.map((h, i) => (
                <div key={i} className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${h.isFake ? 'bg-[#e24b4a]' : 'bg-[#3b9e75]'}`} />
                  <span className="text-sm text-white/70 flex-1">{h.isFake ? 'Fake erkannt' : 'Echte Stimme'}</span>
                  <span className="text-xs text-white/30">Score: {h.fakeScore}/100</span>
                  <span className="text-xs font-mono text-white/40">{h.confidence}%</span>
                  <span className="text-xs text-white/25">{new Date(h.timestamp).toLocaleTimeString('de-DE')}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
