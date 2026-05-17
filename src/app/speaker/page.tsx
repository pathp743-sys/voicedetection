'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import AppLayout from '@/components/AppLayout'
import { Mic, MicOff, UserPlus, Users, Trash2, Fingerprint, Upload, X, CheckCircle, AlertCircle } from 'lucide-react'

type Speaker = {
  name: string
  color: string
  sample1: number[]   // FFT of first recording
  sample2: number[]   // FFT of second recording
  addedAt: string
}

type RecResult = {
  matched: boolean
  matchedSpeaker: string | null
  confidence: number
  scores: { name: string; score: number }[]
  analysis: string
  timestamp: string
}

const COLORS = ['#2563eb','#10b981','#f59e0b','#8b5cf6','#ef4444','#06b6d4','#f43f5e','#84cc16']

const loadSpeakers = (): Speaker[] => {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem('vs_speakers_v2') || '[]') } catch { return [] }
}
const saveSpeakers = (s: Speaker[]) => {
  if (typeof window !== 'undefined') localStorage.setItem('vs_speakers_v2', JSON.stringify(s))
}

const FFT_SIZE = 2048
const BARS = 32

// Record audio and return averaged FFT
async function recordFft(seconds: number, onProgress: (s: number) => void): Promise<{ fft: number[]; bars: number[] }> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { sampleRate: 16000 }, video: false })
  const ctx = new AudioContext({ sampleRate: 16000 })
  const analyser = ctx.createAnalyser()
  analyser.fftSize = FFT_SIZE
  analyser.smoothingTimeConstant = 0.1
  ctx.createMediaStreamSource(stream).connect(analyser)

  const acc = new Array(FFT_SIZE / 2).fill(0)
  let frames = 0
  const dataArray = new Float32Array(analyser.frequencyBinCount)
  let elapsed = 0

  return new Promise(resolve => {
    const interval = setInterval(() => {
      analyser.getFloatFrequencyData(dataArray)
      for (let i = 0; i < dataArray.length; i++) {
        acc[i] += Math.min(100, Math.max(0, (dataArray[i] + 100)))
      }
      frames++
      elapsed++
      onProgress(elapsed)
      if (elapsed >= seconds * 10) {
        clearInterval(interval)
        stream.getTracks().forEach(t => t.stop())
        ctx.close()
        const fft = acc.map(v => v / frames)
        const step = Math.floor(fft.length / BARS)
        const bars = Array(BARS).fill(0).map((_, i) =>
          fft.slice(i * step, (i + 1) * step).reduce((a, b) => Math.max(a, b), 0)
        )
        resolve({ fft, bars })
      }
    }, 100)
  })
}

// Cosine similarity between two FFT vectors
function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length)
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

export default function SpeakerPage() {
  const [tab, setTab] = useState<'list' | 'add' | 'recognize'>('list')
  const [speakers, setSpeakers] = useState<Speaker[]>([])

  // Add flow
  const [newName, setNewName] = useState('')
  const [addStep, setAddStep] = useState<0 | 1 | 2 | 3>(0) // 0=name, 1=rec1, 2=rec2, 3=done
  const [sample1, setSample1] = useState<number[]>([])
  const [sample1Bars, setSample1Bars] = useState<number[]>([])
  const [sample2, setSample2] = useState<number[]>([])
  const [sample2Bars, setSample2Bars] = useState<number[]>([])
  const [recBars, setRecBars] = useState<number[]>(Array(BARS).fill(2))
  const [recProgress, setRecProgress] = useState(0)
  const [isRecording, setIsRecording] = useState(false)

  // Recognize flow
  const [recMode, setRecMode] = useState<'live' | 'file'>('live')
  const [recognizing, setRecognizing] = useState(false)
  const [recSeconds, setRecSeconds] = useState(0)
  const [hasRec, setHasRec] = useState(false)
  const [liveFft, setLiveFft] = useState<number[]>([])
  const [liveBars, setLiveBars] = useState<number[]>(Array(BARS).fill(2))
  const [isLiveRec, setIsLiveRec] = useState(false)
  const [result, setResult] = useState<RecResult | null>(null)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)

  const fileRef = useRef<HTMLInputElement>(null)
  const liveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const liveStreamRef = useRef<MediaStream | null>(null)
  const liveCtxRef = useRef<AudioContext | null>(null)
  const liveAnimRef = useRef<number | null>(null)
  const liveAccRef = useRef<number[]>([])
  const liveFramesRef = useRef(0)

  useEffect(() => { setSpeakers(loadSpeakers()) }, [])

  // ── ADD FLOW ──────────────────────────────────────────────

  async function startRecording(step: 1 | 2) {
    setIsRecording(true)
    setRecProgress(0)
    setRecBars(Array(BARS).fill(2))
    try {
      const { fft, bars } = await recordFft(4, (prog) => {
        setRecProgress(prog)
        setRecBars(Array(BARS).fill(0).map(() => Math.floor(Math.random() * 40) + 4))
      })
      setIsRecording(false)
      setRecBars(bars)
      if (step === 1) {
        setSample1(fft)
        setSample1Bars(bars)
        setAddStep(2)
      } else {
        setSample2(fft)
        setSample2Bars(bars)
        setAddStep(3)
      }
    } catch {
      setIsRecording(false)
      alert('Mikrofon-Zugriff verweigert. Bitte in Browser-Einstellungen erlauben.')
    }
  }

  function saveSpeaker() {
    const name = newName.trim()
    if (!name || sample1.length === 0 || sample2.length === 0) return
    const color = COLORS[speakers.length % COLORS.length]
    const updated = [...speakers, { name, color, sample1, sample2, addedAt: new Date().toISOString() }]
    setSpeakers(updated)
    saveSpeakers(updated)
    // Reset
    setNewName(''); setSample1([]); setSample2([]); setSample1Bars([]); setSample2Bars([])
    setAddStep(0); setTab('list')
  }

  function resetAdd() {
    setNewName(''); setSample1([]); setSample2([]); setAddStep(0); setRecProgress(0)
  }

  function removeSpeaker(name: string) {
    const updated = speakers.filter(s => s.name !== name)
    setSpeakers(updated); saveSpeakers(updated); setResult(null)
  }

  // ── RECOGNIZE FLOW ────────────────────────────────────────

  async function startLiveRecognize() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { sampleRate: 16000 }, video: false })
      liveStreamRef.current = stream
      const ctx = new AudioContext({ sampleRate: 16000 })
      liveCtxRef.current = ctx
      const analyser = ctx.createAnalyser()
      analyser.fftSize = FFT_SIZE
      analyser.smoothingTimeConstant = 0.1
      ctx.createMediaStreamSource(stream).connect(analyser)
      liveAccRef.current = new Array(FFT_SIZE / 2).fill(0)
      liveFramesRef.current = 0
      const dataArr = new Float32Array(analyser.frequencyBinCount)
      setIsLiveRec(true); setRecSeconds(0); setHasRec(false); setResult(null)

      liveTimerRef.current = setInterval(() => setRecSeconds(s => s + 1), 1000)

      const drawLoop = () => {
        analyser.getFloatFrequencyData(dataArr)
        const mag = Array.from(dataArr).map(db => Math.min(100, Math.max(0, db + 100)))
        for (let i = 0; i < mag.length; i++) liveAccRef.current[i] += mag[i]
        liveFramesRef.current++
        const step = Math.floor(mag.length / BARS)
        setLiveBars(Array(BARS).fill(0).map((_, i) => mag.slice(i*step,(i+1)*step).reduce((a,b)=>Math.max(a,b),0)))
        liveAnimRef.current = requestAnimationFrame(drawLoop)
      }
      liveAnimRef.current = requestAnimationFrame(drawLoop)
    } catch { alert('Mikrofon-Zugriff verweigert.') }
  }

  function stopLiveRecognize() {
    if (liveAnimRef.current) cancelAnimationFrame(liveAnimRef.current)
    if (liveTimerRef.current) clearInterval(liveTimerRef.current)
    liveStreamRef.current?.getTracks().forEach(t => t.stop())
    liveCtxRef.current?.close()
    const frames = liveFramesRef.current || 1
    const avg = liveAccRef.current.map(v => v / frames)
    setLiveFft(avg)
    const step = Math.floor(avg.length / BARS)
    setLiveBars(Array(BARS).fill(0).map((_, i) => avg.slice(i*step,(i+1)*step).reduce((a,b)=>Math.max(a,b),0)))
    setIsLiveRec(false); setHasRec(true)
  }

  async function extractFileFft(file: File): Promise<number[]> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = async e => {
        try {
          const buf = e.target?.result as ArrayBuffer
          const tmpCtx = new AudioContext()
          const decoded = await tmpCtx.decodeAudioData(buf.slice(0))
          await tmpCtx.close()
          const data = decoded.getChannelData(0)
          const fftSz = FFT_SIZE
          const numFrames = Math.min(50, Math.floor(data.length / fftSz))
          const acc = new Array(fftSz / 2).fill(0)
          for (let frame = 0; frame < numFrames; frame++) {
            const start = frame * fftSz
            const windowed = new Float32Array(fftSz)
            for (let i = 0; i < fftSz; i++) {
              windowed[i] = (data[start + i] || 0) * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / fftSz))
            }
            for (let k = 0; k < fftSz / 2; k++) {
              let re = 0, im = 0
              for (let n = 0; n < fftSz; n += 4) {
                const angle = -2 * Math.PI * k * n / fftSz
                re += windowed[n] * Math.cos(angle)
                im += windowed[n] * Math.sin(angle)
              }
              acc[k] += Math.min(100, Math.sqrt(re*re+im*im) / (fftSz/4) * 200)
            }
          }
          resolve(acc.map(v => v / numFrames))
        } catch(err) { reject(err) }
      }
      reader.onerror = reject
      reader.readAsArrayBuffer(file)
    })
  }

  async function recognize() {
    if (speakers.length === 0) { alert('Zuerst Personen registrieren.'); return }
    setLoading(true)
    try {
      let queryFft = liveFft
      if (recMode === 'file' && uploadFile) {
        queryFft = await extractFileFft(uploadFile)
      }
      if (queryFft.length === 0) { alert('Keine Aufnahme vorhanden.'); setLoading(false); return }

      // Compare against all enrolled speakers using cosine similarity on both samples
      const scores = speakers.map(sp => {
        const sim1 = cosineSimilarity(queryFft, sp.sample1)
        const sim2 = cosineSimilarity(queryFft, sp.sample2)
        const best = Math.max(sim1, sim2)
        return { name: sp.name, score: Math.round(best * 100) }
      })

      scores.sort((a, b) => b.score - a.score)
      const top = scores[0]
      const THRESHOLD = 72 // Minimum similarity to declare a match
      const matched = top.score >= THRESHOLD

      // Claude explains
      const res = await fetch('/api/recognize-speaker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enrolledSpeakers: speakers.map(s => s.name),
          matchedName: matched ? top.name : null,
          confidence: top.score,
          isFileUpload: recMode === 'file',
          fileName: uploadFile?.name || null,
        }),
      })
      const apiData = await res.json()

      setResult({
        matched,
        matchedSpeaker: matched ? top.name : null,
        confidence: top.score,
        scores: scores.map(s => ({ name: s.name, score: s.score, distance: 1 - s.score/100 })),
        analysis: apiData.analysis || '',
        timestamp: new Date().toISOString(),
      })
    } catch (e) { alert('Fehler: ' + e) }
    setLoading(false)
  }

  const initials = (n: string) => n.slice(0, 2).toUpperCase()

  return (
    <AppLayout>
      <div className="p-4 md:p-8 max-w-2xl mx-auto">
        <div className="mb-6 fade-up">
          <h1 style={{fontFamily:'Syne,sans-serif',fontWeight:800,fontSize:'clamp(22px,5vw,32px)',letterSpacing:'-0.03em'}} className="text-white">
            Sprecher-ID
          </h1>
          <p className="text-sm mt-1" style={{color:'var(--muted)'}}>Stimme 2× aufnehmen → automatisch erkennen</p>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 p-1 rounded-2xl mb-6 fade-up-1" style={{background:'var(--surface)'}}>
          {[
            { id: 'list' as const, icon: Users, label: `Profile (${speakers.length})` },
            { id: 'add' as const, icon: UserPlus, label: 'Registrieren' },
            { id: 'recognize' as const, icon: Fingerprint, label: 'Erkennen' },
          ].map(t => (
            <button key={t.id} onClick={() => { setTab(t.id); if(t.id==='add') resetAdd() }}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold transition-all"
              style={{
                background: tab===t.id ? 'rgba(37,99,235,0.2)' : 'transparent',
                color: tab===t.id ? 'var(--blue)' : 'var(--muted)',
                border: tab===t.id ? '1px solid rgba(37,99,235,0.3)' : '1px solid transparent',
              }}>
              <t.icon size={13}/>{t.label}
            </button>
          ))}
        </div>

        {/* ── LIST ── */}
        {tab === 'list' && (
          <div className="fade-up space-y-3">
            {speakers.length === 0 ? (
              <div className="card p-10 text-center">
                <div className="text-4xl mb-3">🎙️</div>
                <div className="font-semibold text-white mb-1">Noch keine Personen registriert</div>
                <div className="text-sm mb-4" style={{color:'var(--muted)'}}>
                  Gehe zu "Registrieren" und nehme 2 Stimmproben auf
                </div>
                <button onClick={() => setTab('add')}
                  className="text-sm px-5 py-2.5 rounded-xl font-semibold"
                  style={{background:'rgba(37,99,235,0.2)',color:'var(--blue)',border:'1px solid rgba(37,99,235,0.3)'}}>
                  Person registrieren →
                </button>
              </div>
            ) : (
              <>
                {speakers.map(s => (
                  <div key={s.name} className="card p-4 flex items-center gap-3">
                    <div className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                      style={{background:s.color+'25',color:s.color}}>
                      {initials(s.name)}
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-white">{s.name}</div>
                      <div className="text-xs mt-0.5 flex items-center gap-1" style={{color:'var(--green)'}}>
                        <CheckCircle size={11}/> 2 Stimmproben · Bereit
                      </div>
                    </div>
                    <button onClick={() => removeSpeaker(s.name)} style={{color:'var(--dimmed)'}}>
                      <Trash2 size={16}/>
                    </button>
                  </div>
                ))}
                <button onClick={() => setTab('recognize')}
                  className="w-full py-3 rounded-xl font-semibold text-sm"
                  style={{background:'rgba(37,99,235,0.15)',color:'var(--blue)',border:'1px solid rgba(37,99,235,0.3)'}}>
                  Sprecher erkennen →
                </button>
              </>
            )}
          </div>
        )}

        {/* ── ADD / REGISTER ── */}
        {tab === 'add' && (
          <div className="fade-up space-y-4">

            {/* Step indicator */}
            <div className="flex items-center gap-2">
              {[
                { n:1, label:'Name' },
                { n:2, label:'Probe 1' },
                { n:3, label:'Probe 2' },
                { n:4, label:'Fertig' },
              ].map((s, i) => (
                <div key={s.n} className="flex items-center gap-2 flex-1">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-all"
                    style={{
                      background: addStep >= s.n ? 'rgba(37,99,235,0.3)' : 'rgba(255,255,255,0.05)',
                      color: addStep >= s.n ? 'var(--blue)' : 'var(--dimmed)',
                      border: addStep === s.n-1 ? '1px solid rgba(37,99,235,0.5)' : '1px solid transparent',
                    }}>
                    {addStep > s.n ? '✓' : s.n}
                  </div>
                  <span className="text-xs hidden sm:block" style={{color: addStep >= s.n ? 'var(--blue)' : 'var(--dimmed)'}}>{s.label}</span>
                  {i < 3 && <div className="flex-1 h-px" style={{background:'var(--border)'}}/>}
                </div>
              ))}
            </div>

            {/* Step 0: Name */}
            {addStep === 0 && (
              <div className="card p-6">
                <div className="text-base font-semibold text-white mb-1">Name eingeben</div>
                <div className="text-sm mb-4" style={{color:'var(--muted)'}}>Wie heißt die Person? (kein "Umur" vorbelegt)</div>
                <input type="text" value={newName} onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => e.key==='Enter' && newName.trim().length >= 2 && setAddStep(1)}
                  placeholder="z.B. Thomas, Anna, Max…"
                  autoFocus
                  className="w-full rounded-xl px-4 py-3 text-sm text-white outline-none mb-4"
                  style={{background:'rgba(255,255,255,0.05)',border:'1px solid var(--border2)',fontFamily:'inherit'}}/>
                <button onClick={() => setAddStep(1)} disabled={newName.trim().length < 2}
                  className="w-full py-3 rounded-xl font-semibold text-sm transition-all"
                  style={{background:'rgba(37,99,235,0.2)',color:'var(--blue)',border:'1px solid rgba(37,99,235,0.3)',opacity:newName.trim().length<2?0.4:1}}>
                  Weiter → Erste Aufnahme
                </button>
              </div>
            )}

            {/* Step 1: First recording */}
            {addStep === 1 && (
              <div className="card p-6">
                <div className="text-base font-semibold text-white mb-1">Erste Stimm­probe — <span style={{color:'var(--blue)'}}>{newName}</span></div>
                <div className="text-sm mb-4" style={{color:'var(--muted)'}}>
                  Sprich 4 Sekunden laut und deutlich. Lies z.B. einen kurzen Satz vor.
                </div>
                {/* Waveform */}
                <div className="rounded-xl mb-4 flex items-end gap-[2px] px-3 py-2 overflow-hidden" style={{height:64,background:'#08080f'}}>
                  {recBars.map((h,i) => (
                    <div key={i} className="flex-1 rounded-t-sm transition-all"
                      style={{height:`${Math.max(3,h)}%`,background:isRecording?'var(--blue)':'#1e1e30',transitionDuration:'80ms'}}/>
                  ))}
                </div>
                {isRecording && (
                  <div className="text-center mb-3">
                    <div className="text-sm font-semibold" style={{color:'var(--red)'}}>
                      🔴 Aufnahme läuft — {Math.ceil((40 - recProgress) / 10)}s verbleibend
                    </div>
                  </div>
                )}
                <button onClick={() => startRecording(1)} disabled={isRecording}
                  className="w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all"
                  style={{background:isRecording?'rgba(239,68,68,0.15)':'rgba(37,99,235,0.2)',color:isRecording?'var(--red)':'var(--blue)',border:`1px solid ${isRecording?'rgba(239,68,68,0.3)':'rgba(37,99,235,0.3)'}`,opacity:isRecording?0.8:1}}>
                  {isRecording ? <><div className="w-4 h-4 rounded-full border-2 spin" style={{borderColor:'rgba(239,68,68,0.3)',borderTopColor:'var(--red)'}}/>Aufnahme läuft…</> : <><Mic size={15}/>Erste Aufnahme starten (4s)</>}
                </button>
              </div>
            )}

            {/* Step 2: Second recording */}
            {addStep === 2 && (
              <div className="card p-6">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle size={16} style={{color:'var(--green)'}}/>
                  <div className="text-base font-semibold text-white">Erste Probe gespeichert ✓</div>
                </div>
                {/* Show sample 1 bars */}
                <div className="rounded-lg mb-4 flex items-end gap-[2px] px-2 py-1.5 overflow-hidden" style={{height:32,background:'rgba(16,185,129,0.06)',border:'1px solid rgba(16,185,129,0.2)'}}>
                  {sample1Bars.map((h,i) => (
                    <div key={i} className="flex-1 rounded-t-sm" style={{height:`${Math.max(2,h)}%`,background:'rgba(16,185,129,0.4)'}}/>
                  ))}
                </div>
                <div className="text-base font-semibold text-white mb-1">Zweite Stimmprobe — <span style={{color:'var(--blue)'}}>{newName}</span></div>
                <div className="text-sm mb-4" style={{color:'var(--muted)'}}>
                  Sprich nochmal 4 Sekunden. Gerne denselben oder einen anderen Satz.
                </div>
                <div className="rounded-xl mb-4 flex items-end gap-[2px] px-3 py-2 overflow-hidden" style={{height:64,background:'#08080f'}}>
                  {recBars.map((h,i) => (
                    <div key={i} className="flex-1 rounded-t-sm transition-all"
                      style={{height:`${Math.max(3,h)}%`,background:isRecording?'var(--blue)':'#1e1e30',transitionDuration:'80ms'}}/>
                  ))}
                </div>
                {isRecording && (
                  <div className="text-center mb-3">
                    <div className="text-sm font-semibold" style={{color:'var(--red)'}}>
                      🔴 Aufnahme läuft — {Math.ceil((40 - recProgress) / 10)}s verbleibend
                    </div>
                  </div>
                )}
                <button onClick={() => startRecording(2)} disabled={isRecording}
                  className="w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2"
                  style={{background:isRecording?'rgba(239,68,68,0.15)':'rgba(37,99,235,0.2)',color:isRecording?'var(--red)':'var(--blue)',border:`1px solid ${isRecording?'rgba(239,68,68,0.3)':'rgba(37,99,235,0.3)'}`}}>
                  {isRecording ? <><div className="w-4 h-4 rounded-full border-2 spin" style={{borderColor:'rgba(239,68,68,0.3)',borderTopColor:'var(--red)'}}/>Aufnahme läuft…</> : <><Mic size={15}/>Zweite Aufnahme starten (4s)</>}
                </button>
              </div>
            )}

            {/* Step 3: Confirm */}
            {addStep === 3 && (
              <div className="card p-6">
                <div className="text-center mb-5">
                  <div className="text-4xl mb-2">✅</div>
                  <div className="text-lg font-bold text-white">Beide Proben aufgenommen!</div>
                  <div className="text-sm mt-1" style={{color:'var(--muted)'}}>Stimmabdruck für <span className="text-white font-semibold">{newName}</span> bereit</div>
                </div>
                <div className="space-y-2 mb-5">
                  {[{label:'Probe 1', bars: sample1Bars},{label:'Probe 2', bars: sample2Bars}].map((p,pi) => (
                    <div key={pi}>
                      <div className="text-xs mb-1" style={{color:'var(--dimmed)'}}>{p.label}</div>
                      <div className="rounded-lg flex items-end gap-[2px] px-2 py-1.5 overflow-hidden" style={{height:28,background:'rgba(37,99,235,0.06)',border:'1px solid rgba(37,99,235,0.15)'}}>
                        {p.bars.map((h,i) => (
                          <div key={i} className="flex-1 rounded-t-sm" style={{height:`${Math.max(2,h)}%`,background:'rgba(37,99,235,0.5)'}}/>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <button onClick={saveSpeaker}
                  className="w-full py-3 rounded-xl font-semibold text-sm"
                  style={{background:'rgba(16,185,129,0.2)',color:'var(--green)',border:'1px solid rgba(16,185,129,0.3)'}}>
                  ✓ {newName} speichern
                </button>
                <button onClick={() => setAddStep(2)} className="w-full py-2 mt-2 text-sm" style={{color:'var(--dimmed)'}}>
                  Zweite Probe wiederholen
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── RECOGNIZE ── */}
        {tab === 'recognize' && (
          <div className="fade-up space-y-4">
            {speakers.length === 0 ? (
              <div className="card p-6 text-center" style={{border:'1px solid rgba(245,158,11,0.2)'}}>
                <AlertCircle size={24} className="mx-auto mb-2" style={{color:'var(--amber)'}}/>
                <div className="text-sm font-semibold" style={{color:'var(--amber)'}}>Keine Profile vorhanden</div>
                <div className="text-xs mt-1 mb-3" style={{color:'var(--muted)'}}>Zuerst unter "Registrieren" Personen hinzufügen</div>
                <button onClick={() => setTab('add')} className="text-xs px-4 py-2 rounded-lg font-semibold"
                  style={{background:'rgba(245,158,11,0.15)',color:'var(--amber)',border:'1px solid rgba(245,158,11,0.3)'}}>
                  Jetzt registrieren →
                </button>
              </div>
            ) : (
              <>
                {/* Mode tabs */}
                <div className="flex gap-2">
                  {[{id:'live' as const,icon:Mic,label:'Live aufnehmen'},{id:'file' as const,icon:Upload,label:'Datei'}].map(m=>(
                    <button key={m.id} onClick={()=>{setRecMode(m.id);setHasRec(false);setResult(null);setUploadFile(null)}}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold transition-all"
                      style={{background:recMode===m.id?'rgba(37,99,235,0.2)':'rgba(255,255,255,0.03)',color:recMode===m.id?'var(--blue)':'var(--muted)',border:recMode===m.id?'1px solid rgba(37,99,235,0.3)':'1px solid var(--border)'}}>
                      <m.icon size={13}/>{m.label}
                    </button>
                  ))}
                </div>

                {/* Enrolled list */}
                <div className="flex gap-2 flex-wrap">
                  {speakers.map(s => (
                    <div key={s.name} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium"
                      style={{background:s.color+'18',color:s.color,border:`1px solid ${s.color}30`}}>
                      <div className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold" style={{background:s.color+'30'}}>
                        {s.name[0]}
                      </div>
                      {s.name}
                    </div>
                  ))}
                </div>

                {recMode === 'live' ? (
                  <div className="card p-5">
                    {/* Waveform */}
                    <div className="rounded-xl mb-4 flex items-end gap-[2px] px-3 py-2 overflow-hidden" style={{height:64,background:'#08080f'}}>
                      {liveBars.map((h,i) => (
                        <div key={i} className="flex-1 rounded-t-sm transition-all"
                          style={{height:`${Math.max(2,h)}%`,background:isLiveRec?'var(--blue)':'#1e1e30',transitionDuration:'80ms'}}/>
                      ))}
                    </div>
                    {isLiveRec && (
                      <div className="text-center mb-3">
                        <div className="text-2xl font-mono font-bold text-white">
                          {String(Math.floor(recSeconds/60)).padStart(2,'0')}:{String(recSeconds%60).padStart(2,'0')}
                        </div>
                        <div className="text-xs mt-0.5" style={{color:'var(--muted)'}}>Spreche 3–5 Sekunden</div>
                      </div>
                    )}
                    {!isLiveRec && hasRec && (
                      <div className="text-center mb-3 text-xs" style={{color:'var(--green)'}}>
                        ✓ {recSeconds}s aufgenommen — bereit
                      </div>
                    )}
                    <button onClick={isLiveRec ? stopLiveRecognize : startLiveRecognize}
                      className="w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all"
                      style={isLiveRec
                        ? {background:'rgba(239,68,68,0.15)',color:'var(--red)',border:'1px solid rgba(239,68,68,0.3)'}
                        : {background:'rgba(255,255,255,0.05)',color:'white',border:'1px solid var(--border2)'}}>
                      {isLiveRec ? <><MicOff size={15}/>Stoppen</> : <><Mic size={15}/>Live aufnehmen</>}
                    </button>
                  </div>
                ) : (
                  <div className="card p-5">
                    <div onClick={() => fileRef.current?.click()}
                      className="border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-2 py-6 cursor-pointer mb-3"
                      style={{borderColor:'var(--border2)',background:'rgba(255,255,255,0.02)'}}>
                      <input ref={fileRef} type="file" accept=".mp3,.wav,.ogg,.flac,.m4a" className="hidden"
                        onChange={e=>{if(e.target.files?.[0]){setUploadFile(e.target.files[0]);setResult(null);setHasRec(true)}}}/>
                      {uploadFile
                        ? <><CheckCircle size={20} style={{color:'var(--blue)'}}/><span className="text-sm text-white">{uploadFile.name}</span></>
                        : <><Upload size={20} style={{color:'var(--dimmed)'}}/><span className="text-sm" style={{color:'var(--muted)'}}>Audiodatei hochladen</span></>}
                    </div>
                  </div>
                )}

                <button onClick={recognize} disabled={!hasRec || loading}
                  className="w-full py-3.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all"
                  style={{background:'rgba(37,99,235,0.2)',color:'var(--blue)',border:'1px solid rgba(37,99,235,0.3)',opacity:(!hasRec||loading)?0.4:1}}>
                  {loading
                    ? <><div className="w-4 h-4 rounded-full border-2 spin" style={{borderColor:'rgba(37,99,235,0.3)',borderTopColor:'var(--blue)'}}/>Erkenne…</>
                    : <><Fingerprint size={15}/>Wer spricht?</>}
                </button>

                {/* Result */}
                {result && (
                  <div className="card p-5 fade-up"
                    style={{border:`1px solid ${result.matched?'rgba(16,185,129,0.3)':'rgba(239,68,68,0.3)'}`,
                           background:result.matched?'rgba(16,185,129,0.06)':'rgba(239,68,68,0.06)'}}>
                    <div className="text-center mb-5">
                      <div style={{fontSize:48,lineHeight:1,marginBottom:8}}>{result.matched?'✅':'❓'}</div>
                      <div style={{fontFamily:'Syne,sans-serif',fontWeight:800,fontSize:32,letterSpacing:'-0.03em',
                                  color:result.matched?'var(--green)':'var(--red)'}}>
                        {result.matched ? result.matchedSpeaker : 'Unbekannt'}
                      </div>
                      <div className="text-sm mt-1" style={{color:'var(--muted)'}}>
                        {result.confidence}% Stimmübereinstimmung
                      </div>
                    </div>
                    <div className="space-y-2.5">
                      {result.scores.map(s => {
                        const sp = speakers.find(x => x.name === s.name)
                        const isTop = s.name === result.matchedSpeaker
                        return (
                          <div key={s.name}>
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-2">
                                {sp && <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold" style={{background:sp.color+'25',color:sp.color}}>{sp.name[0]}</div>}
                                <span className="text-sm" style={{color:isTop?'white':'var(--muted)',fontWeight:isTop?600:400}}>{s.name}</span>
                              </div>
                              <span className="text-sm font-mono font-bold" style={{color:isTop?'var(--green)':'var(--dimmed)'}}>{s.score}%</span>
                            </div>
                            <div className="h-1.5 rounded-full overflow-hidden" style={{background:'rgba(255,255,255,0.06)'}}>
                              <div className="h-full rounded-full" style={{width:`${s.score}%`,background:isTop?'var(--green)':'rgba(255,255,255,0.15)'}}/>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
