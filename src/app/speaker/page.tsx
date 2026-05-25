'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import AppLayout from '@/components/AppLayout'
import { Mic, MicOff, UserPlus, Users, Trash2, Fingerprint, Upload, X, CheckCircle, AlertCircle, Info } from 'lucide-react'

const SPACE_URL = 'https://kibrisli123-voicesense-detect.hf.space'
const COLORS = ['#2563eb','#10b981','#f59e0b','#8b5cf6','#ef4444','#06b6d4','#f43f5e','#84cc16']
const BARS = 40

type Speaker = { name: string; color: string; embedding: number[]; addedAt: string }
type RecResult = { matched: boolean; matchedSpeaker: string | null; confidence: number; scores: { name: string; score: number }[]; timestamp: string }

// Cosine similarity between two embedding vectors
function cosine(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length)
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < len; i++) { dot += a[i]*b[i]; na += a[i]*a[i]; nb += b[i]*b[i] }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0
}

const load = (): Speaker[] => { try { return JSON.parse(localStorage.getItem('vs_spk_v3')||'[]') } catch { return [] } }
const save = (s: Speaker[]) => localStorage.setItem('vs_spk_v3', JSON.stringify(s))

// Record audio for N seconds, return Blob
async function recordAudio(seconds: number, onTick: (s:number)=>void, onBars: (b:number[])=>void): Promise<Blob> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { sampleRate: 16000, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    video: false
  })
  const ctx = new AudioContext({ sampleRate: 16000 })
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 512
  ctx.createMediaStreamSource(stream).connect(analyser)
  const data = new Uint8Array(analyser.frequencyBinCount)

  const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' })
  const chunks: Blob[] = []
  mr.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data) }
  mr.start(100)

  let elapsed = 0
  await new Promise<void>(resolve => {
    const tick = setInterval(() => {
      analyser.getByteFrequencyData(data)
      const step = Math.floor(data.length / BARS)
      onBars(Array(BARS).fill(0).map((_,i) => Math.round(Math.max(...Array.from(data.slice(i*step,(i+1)*step))) / 2.55)))
      elapsed++
      onTick(elapsed)
      if (elapsed >= seconds * 10) { clearInterval(tick); resolve() }
    }, 100)
  })

  mr.stop()
  stream.getTracks().forEach(t => t.stop())
  ctx.close()
  await new Promise(r => setTimeout(r, 300))
  return new Blob(chunks, { type: 'audio/webm' })
}

// Send audio blob to HF Space, get ECAPA-TDNN embedding
async function getEmbedding(blob: Blob, filename = 'audio.webm'): Promise<number[]> {
  const fd = new FormData()
  fd.append('file', blob, filename)
  const res = await fetch(`${SPACE_URL}/speaker/embed`, { method: 'POST', body: fd })
  if (!res.ok) throw new Error(`Space error ${res.status}: ${await res.text()}`)
  const data = await res.json()
  if (data.error) throw new Error(data.error)
  return data.embedding as number[]
}

export default function SpeakerPage() {
  const [tab, setTab] = useState<'list'|'add'|'recognize'>('list')
  const [speakers, setSpeakers] = useState<Speaker[]>([])

  // Add flow
  const [newName, setNewName] = useState('')
  const [addStep, setAddStep] = useState(0) // 0=name, 1=rec1, 2=rec2, 3=confirm
  const [emb1, setEmb1] = useState<number[]>([])
  const [emb2, setEmb2] = useState<number[]>([])
  const [recBars, setRecBars] = useState<number[]>(Array(BARS).fill(2))
  const [recSeconds, setRecSeconds] = useState(0)
  const [recState, setRecState] = useState<'idle'|'recording'|'uploading'|'done'|'error'>('idle')
  const [recError, setRecError] = useState('')

  // Recognize flow
  const [recMode, setRecMode] = useState<'live'|'file'>('live')
  const [liveState, setLiveState] = useState<'idle'|'recording'|'uploading'|'done'|'error'>('idle')
  const [liveSeconds, setLiveSeconds] = useState(0)
  const [liveBars, setLiveBars] = useState<number[]>(Array(BARS).fill(2))
  const [liveEmb, setLiveEmb] = useState<number[]>([])
  const [result, setResult] = useState<RecResult|null>(null)
  const [uploadFile, setUploadFile] = useState<File|null>(null)
  const [uploadEmb, setUploadEmb] = useState<number[]>([])
  const [uploadState, setUploadState] = useState<'idle'|'uploading'|'done'|'error'>('idle')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setSpeakers(load()) }, [])

  const initials = (n: string) => n.slice(0,2).toUpperCase()

  // ── RECORD helper for enrollment ──────────────────────────────────────────
  async function doRecord(step: 1|2) {
    setRecState('recording'); setRecSeconds(0); setRecBars(Array(BARS).fill(2))
    try {
      const blob = await recordAudio(5, s => setRecSeconds(Math.floor(s/10)), b => setRecBars(b))
      setRecState('uploading')
      const emb = await getEmbedding(blob)
      if (step === 1) { setEmb1(emb); setAddStep(2) }
      else { setEmb2(emb); setAddStep(3) }
      setRecState('done')
    } catch(e) {
      setRecState('error')
      setRecError(e instanceof Error ? e.message : String(e))
    }
  }

  function saveSpeaker() {
    const name = newName.trim()
    if (!name || emb1.length === 0 || emb2.length === 0) return
    // Average both embeddings for robustness
    const avgEmb = emb1.map((v, i) => (v + emb2[i]) / 2)
    const updated = [...speakers, { name, color: COLORS[speakers.length % COLORS.length], embedding: avgEmb, addedAt: new Date().toISOString() }]
    setSpeakers(updated); save(updated)
    setNewName(''); setEmb1([]); setEmb2([]); setAddStep(0); setRecState('idle'); setTab('list')
  }

  function removeSpeaker(name: string) {
    const updated = speakers.filter(s => s.name !== name)
    setSpeakers(updated); save(updated); setResult(null)
  }

  // ── LIVE recognition ──────────────────────────────────────────────────────
  async function startLiveRec() {
    setLiveState('recording'); setLiveSeconds(0); setLiveBars(Array(BARS).fill(2)); setResult(null)
    try {
      const blob = await recordAudio(5, s => setLiveSeconds(Math.floor(s/10)), b => setLiveBars(b))
      setLiveState('uploading')
      const emb = await getEmbedding(blob)
      setLiveEmb(emb); setLiveState('done')
    } catch(e) { setLiveState('error') }
  }

  async function handleFileUpload(file: File) {
    setUploadFile(file); setUploadState('uploading'); setResult(null)
    try {
      const fd = new FormData(); fd.append('file', file)
      const res = await fetch(`${SPACE_URL}/speaker/embed`, { method: 'POST', body: fd })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setUploadEmb(data.embedding); setUploadState('done')
    } catch(e) { setUploadState('error') }
  }

  function recognize() {
    if (speakers.length === 0) return
    const queryEmb = recMode === 'live' ? liveEmb : uploadEmb
    if (queryEmb.length === 0) return

    // Compare with all enrolled speakers using cosine similarity
    const scores = speakers.map(sp => ({
      name: sp.name,
      score: Math.round(cosine(queryEmb, sp.embedding) * 100)
    })).sort((a, b) => b.score - a.score)

    // ECAPA-TDNN: threshold 75% cosine similarity for positive match
    const THRESHOLD = 75
    const top = scores[0]
    const matched = top.score >= THRESHOLD

    setResult({
      matched,
      matchedSpeaker: matched ? top.name : null,
      confidence: top.score,
      scores,
      timestamp: new Date().toISOString(),
    })
  }

  const canRecognize = (recMode === 'live' && liveState === 'done') || (recMode === 'file' && uploadState === 'done')

  return (
    <AppLayout>
      <div className="p-4 md:p-8 max-w-2xl mx-auto">
        <div className="mb-5 fade-up">
          <h1 style={{fontFamily:'Syne,sans-serif',fontWeight:800,fontSize:'clamp(22px,5vw,32px)',letterSpacing:'-0.03em'}} className="text-white">
            Sprecher-ID
          </h1>
          <p className="text-sm mt-1" style={{color:'var(--muted)'}}>ECAPA-TDNN · 192-dim Speaker Embeddings · VoxCeleb</p>
        </div>

        {/* Info */}
        <div className="card p-4 mb-5 fade-up-1" style={{border:'1px solid rgba(37,99,235,0.2)',background:'rgba(37,99,235,0.04)'}}>
          <div className="flex gap-3">
            <Info size={14} style={{color:'var(--blue)',flexShrink:0,marginTop:2}}/>
            <div className="text-xs leading-relaxed" style={{color:'var(--muted)'}}>
              <strong className="text-white">ECAPA-TDNN</strong> extrahiert einen 192-dimensionalen Stimmabdruck — trainiert auf VoxCeleb mit über 1 Million Aufnahmen.
              EER: <strong className="text-white">0.69%</strong> (Industriestandard). Erkennung via Cosine-Similarity der Embeddings, nicht FFT.
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 rounded-2xl mb-6 fade-up-1" style={{background:'var(--surface)'}}>
          {[{id:'list' as const,icon:Users,label:`Profile (${speakers.length})`},{id:'add' as const,icon:UserPlus,label:'Registrieren'},{id:'recognize' as const,icon:Fingerprint,label:'Erkennen'}].map(t=>(
            <button key={t.id} onClick={()=>{setTab(t.id);if(t.id==='add'){setAddStep(0);setRecState('idle');setEmb1([]);setEmb2([]);setNewName('')}}}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold transition-all"
              style={{background:tab===t.id?'rgba(37,99,235,0.2)':'transparent',color:tab===t.id?'var(--blue)':'var(--muted)',border:tab===t.id?'1px solid rgba(37,99,235,0.3)':'1px solid transparent'}}>
              <t.icon size={13}/>{t.label}
            </button>
          ))}
        </div>

        {/* ── LIST ── */}
        {tab==='list' && (
          <div className="fade-up space-y-3">
            {speakers.length===0 ? (
              <div className="card p-10 text-center">
                <div className="text-4xl mb-3">🎙️</div>
                <div className="font-semibold text-white mb-1">Keine Profile</div>
                <div className="text-sm mb-4" style={{color:'var(--muted)'}}>Registriere Personen mit 2 Stimmproben</div>
                <button onClick={()=>setTab('add')} className="text-sm px-5 py-2.5 rounded-xl font-semibold"
                  style={{background:'rgba(37,99,235,0.2)',color:'var(--blue)',border:'1px solid rgba(37,99,235,0.3)'}}>
                  Person registrieren →
                </button>
              </div>
            ) : (
              <>
                {speakers.map(s=>(
                  <div key={s.name} className="card p-4 flex items-center gap-3">
                    <div className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                      style={{background:s.color+'25',color:s.color}}>{initials(s.name)}</div>
                    <div className="flex-1">
                      <div className="font-semibold text-white">{s.name}</div>
                      <div className="text-xs flex items-center gap-1 mt-0.5" style={{color:'var(--green)'}}>
                        <CheckCircle size={11}/> 192-dim Embedding · ECAPA-TDNN
                      </div>
                    </div>
                    <button onClick={()=>removeSpeaker(s.name)} style={{color:'var(--dimmed)'}}><Trash2 size={16}/></button>
                  </div>
                ))}
                <button onClick={()=>setTab('recognize')} className="w-full py-3 rounded-xl font-semibold text-sm"
                  style={{background:'rgba(37,99,235,0.15)',color:'var(--blue)',border:'1px solid rgba(37,99,235,0.3)'}}>
                  Sprecher erkennen →
                </button>
              </>
            )}
          </div>
        )}

        {/* ── ADD ── */}
        {tab==='add' && (
          <div className="fade-up space-y-4">
            {/* Step indicator */}
            <div className="flex items-center gap-1">
              {['Name','Probe 1','Probe 2','Fertig'].map((l,i)=>(
                <div key={l} className="flex items-center gap-1 flex-1">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-all"
                    style={{background:addStep>i?'rgba(37,99,235,0.4)':addStep===i?'rgba(37,99,235,0.2)':'rgba(255,255,255,0.05)',color:addStep>=i?'var(--blue)':'var(--dimmed)'}}>
                    {addStep>i?'✓':i+1}
                  </div>
                  <span className="text-xs hidden sm:block" style={{color:addStep>=i?'var(--blue)':'var(--dimmed)'}}>{l}</span>
                  {i<3&&<div className="flex-1 h-px mx-1" style={{background:'var(--border)'}}/>}
                </div>
              ))}
            </div>

            {/* Step 0: Name */}
            {addStep===0 && (
              <div className="card p-6">
                <div className="text-base font-semibold text-white mb-3">Name der Person</div>
                <input type="text" value={newName} onChange={e=>setNewName(e.target.value)}
                  onKeyDown={e=>e.key==='Enter'&&newName.trim().length>=2&&setAddStep(1)}
                  placeholder="Name eingeben…" autoFocus
                  className="w-full rounded-xl px-4 py-3 text-sm text-white outline-none mb-4"
                  style={{background:'rgba(255,255,255,0.05)',border:'1px solid var(--border2)',fontFamily:'inherit'}}/>
                <button onClick={()=>setAddStep(1)} disabled={newName.trim().length<2}
                  className="w-full py-3 rounded-xl font-semibold text-sm"
                  style={{background:'rgba(37,99,235,0.2)',color:'var(--blue)',border:'1px solid rgba(37,99,235,0.3)',opacity:newName.trim().length<2?0.4:1}}>
                  Weiter →
                </button>
              </div>
            )}

            {/* Step 1 & 2: Recording */}
            {(addStep===1||addStep===2) && (
              <div className="card p-6">
                <div className="text-base font-semibold text-white mb-1">
                  {addStep===1?'Erste':'Zweite'} Stimmprobe — <span style={{color:'var(--blue)'}}>{newName}</span>
                </div>
                <div className="text-sm mb-4" style={{color:'var(--muted)'}}>
                  Sprich 5 Sekunden. Lies z.B.: "Mein Name ist {newName} und ich teste die Stimmerkennung."
                </div>

                {/* Waveform */}
                <div className="rounded-xl mb-4 flex items-end gap-[2px] px-3 py-2" style={{height:64,background:'#08080f'}}>
                  {recBars.map((h,i)=>(
                    <div key={i} className="flex-1 rounded-t-sm transition-all"
                      style={{height:`${Math.max(2,h)}%`,background:recState==='recording'?'var(--blue)':'#1e1e30',transitionDuration:'80ms'}}/>
                  ))}
                </div>

                {recState==='recording' && (
                  <div className="text-center mb-3">
                    <div className="text-2xl font-mono font-bold text-white">{recSeconds}s / 5s</div>
                    <div className="flex items-center justify-center gap-1.5 mt-1">
                      <span className="w-2 h-2 rounded-full blink" style={{background:'var(--red)'}}/>
                      <span className="text-xs" style={{color:'var(--red)'}}>Aufnahme läuft</span>
                    </div>
                  </div>
                )}
                {recState==='uploading' && (
                  <div className="text-center mb-3 text-sm" style={{color:'var(--blue)'}}>
                    <div className="w-5 h-5 border-2 spin rounded-full mx-auto mb-1" style={{borderColor:'rgba(37,99,235,0.3)',borderTopColor:'var(--blue)'}}/>
                    ECAPA-TDNN extrahiert Stimmabdruck…
                  </div>
                )}
                {recState==='error' && (
                  <div className="text-center mb-3 text-sm" style={{color:'var(--red)'}}>
                    Fehler: {recError}<br/>
                    <span style={{color:'var(--dimmed)'}}>HF Space schläft eventuell — 30s warten</span>
                  </div>
                )}

                <button onClick={()=>doRecord(addStep as 1|2)}
                  disabled={recState==='recording'||recState==='uploading'}
                  className="w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2"
                  style={{background:'rgba(37,99,235,0.2)',color:'var(--blue)',border:'1px solid rgba(37,99,235,0.3)',opacity:recState==='recording'||recState==='uploading'?0.5:1}}>
                  {recState==='recording'
                    ? <><div className="w-4 h-4 border-2 spin rounded-full" style={{borderColor:'rgba(37,99,235,0.3)',borderTopColor:'var(--blue)'}}/>Läuft…</>
                    : recState==='uploading'
                    ? <><div className="w-4 h-4 border-2 spin rounded-full" style={{borderColor:'rgba(37,99,235,0.3)',borderTopColor:'var(--blue)'}}/>Verarbeite…</>
                    : <><Mic size={15}/>Aufnahme starten (5s)</>}
                </button>
              </div>
            )}

            {/* Step 3: Confirm */}
            {addStep===3 && (
              <div className="card p-6 text-center">
                <div className="text-4xl mb-3">✅</div>
                <div className="text-lg font-bold text-white">Beide Stimmabdrücke bereit</div>
                <div className="text-sm mt-1 mb-2" style={{color:'var(--muted)'}}>
                  <span className="text-white font-semibold">{newName}</span> · 192-dim ECAPA-TDNN Embedding (gemittelt)
                </div>
                <div className="text-xs mb-5 px-3 py-2 rounded-lg" style={{background:'rgba(16,185,129,0.08)',color:'var(--green)',border:'1px solid rgba(16,185,129,0.2)'}}>
                  ✓ Stimmabdruck extrahiert und bereit zur Erkennung
                </div>
                <button onClick={saveSpeaker} className="w-full py-3 rounded-xl font-semibold text-sm mb-2"
                  style={{background:'rgba(16,185,129,0.2)',color:'var(--green)',border:'1px solid rgba(16,185,129,0.3)'}}>
                  ✓ {newName} speichern
                </button>
                <button onClick={()=>{setAddStep(2);setRecState('idle')}} className="w-full py-2 text-sm" style={{color:'var(--dimmed)'}}>
                  Zweite Probe wiederholen
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── RECOGNIZE ── */}
        {tab==='recognize' && (
          <div className="fade-up space-y-4">
            {speakers.length===0 ? (
              <div className="card p-6 text-center" style={{border:'1px solid rgba(245,158,11,0.2)'}}>
                <AlertCircle size={24} className="mx-auto mb-2" style={{color:'var(--amber)'}}/>
                <div className="text-sm font-semibold" style={{color:'var(--amber)'}}>Keine Profile vorhanden</div>
                <div className="text-xs mt-1 mb-3" style={{color:'var(--muted)'}}>Zuerst Personen unter "Registrieren" hinzufügen</div>
                <button onClick={()=>setTab('add')} className="text-xs px-4 py-2 rounded-lg font-semibold"
                  style={{background:'rgba(245,158,11,0.15)',color:'var(--amber)',border:'1px solid rgba(245,158,11,0.3)'}}>
                  Jetzt registrieren →
                </button>
              </div>
            ) : (
              <>
                {/* Mode */}
                <div className="flex gap-1 p-1 rounded-2xl" style={{background:'var(--surface)'}}>
                  {[{id:'live' as const,icon:Mic,label:'Live aufnehmen'},{id:'file' as const,icon:Upload,label:'Datei hochladen'}].map(m=>(
                    <button key={m.id} onClick={()=>{setRecMode(m.id);setResult(null)}}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold transition-all"
                      style={{background:recMode===m.id?'rgba(37,99,235,0.2)':'transparent',color:recMode===m.id?'var(--blue)':'var(--muted)',border:recMode===m.id?'1px solid rgba(37,99,235,0.3)':'1px solid transparent'}}>
                      <m.icon size={13}/>{m.label}
                    </button>
                  ))}
                </div>

                {/* Enrolled chips */}
                <div className="flex gap-2 flex-wrap">
                  {speakers.map(s=>(
                    <div key={s.name} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
                      style={{background:s.color+'18',color:s.color,border:`1px solid ${s.color}30`}}>
                      <div className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-[7px] font-bold" style={{background:s.color+'30'}}>{s.name[0]}</div>
                      {s.name}
                    </div>
                  ))}
                </div>

                {recMode==='live' ? (
                  <div className="card p-5 space-y-3">
                    <div className="rounded-xl flex items-end gap-[2px] px-3 py-2" style={{height:60,background:'#08080f'}}>
                      {liveBars.map((h,i)=>(
                        <div key={i} className="flex-1 rounded-t-sm transition-all"
                          style={{height:`${Math.max(2,h)}%`,background:liveState==='recording'?'var(--blue)':'#1e1e30',transitionDuration:'80ms'}}/>
                      ))}
                    </div>
                    {liveState==='recording' && <div className="text-center text-sm font-mono font-bold text-white">{liveSeconds}s / 5s</div>}
                    {liveState==='uploading' && <div className="text-center text-sm" style={{color:'var(--blue)'}}>ECAPA-TDNN verarbeitet…</div>}
                    {liveState==='done' && <div className="text-center text-xs flex items-center justify-center gap-1" style={{color:'var(--green)'}}><CheckCircle size={13}/>Embedding bereit · {liveSeconds}s</div>}
                    {liveState==='error' && <div className="text-center text-xs" style={{color:'var(--red)'}}>Fehler — nochmal versuchen</div>}
                    <button onClick={startLiveRec} disabled={liveState==='recording'||liveState==='uploading'}
                      className="w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2"
                      style={{background:'rgba(255,255,255,0.05)',color:'white',border:'1px solid var(--border2)',opacity:liveState==='recording'||liveState==='uploading'?0.5:1}}>
                      {liveState==='recording'||liveState==='uploading'
                        ? <><div className="w-4 h-4 border-2 spin rounded-full" style={{borderColor:'rgba(255,255,255,0.2)',borderTopColor:'white'}}/>Läuft…</>
                        : <><Mic size={15}/>{liveState==='done'?'Nochmal aufnehmen':'Aufnehmen (5s)'}</>}
                    </button>
                  </div>
                ) : (
                  <div className="card p-5">
                    <div onClick={()=>fileRef.current?.click()}
                      className="border-2 border-dashed rounded-xl flex flex-col items-center gap-2 py-6 cursor-pointer mb-3"
                      style={{borderColor:'var(--border2)',background:'rgba(255,255,255,0.02)'}}>
                      <input ref={fileRef} type="file" accept=".mp3,.wav,.ogg,.flac,.m4a" className="hidden"
                        onChange={e=>{if(e.target.files?.[0])handleFileUpload(e.target.files[0])}}/>
                      {uploadState==='uploading'
                        ? <><div className="w-6 h-6 border-2 spin rounded-full" style={{borderColor:'rgba(37,99,235,0.3)',borderTopColor:'var(--blue)'}}/><span className="text-sm" style={{color:'var(--blue)'}}>ECAPA-TDNN verarbeitet…</span></>
                        : uploadState==='done'
                        ? <><CheckCircle size={20} style={{color:'var(--blue)'}}/><span className="text-sm text-white">{uploadFile?.name}</span></>
                        : <><Upload size={20} style={{color:'var(--dimmed)'}}/><span className="text-sm" style={{color:'var(--muted)'}}>Audiodatei hochladen</span></>}
                    </div>
                  </div>
                )}

                <button onClick={recognize} disabled={!canRecognize}
                  className="w-full py-3.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2"
                  style={{background:'rgba(37,99,235,0.2)',color:'var(--blue)',border:'1px solid rgba(37,99,235,0.3)',opacity:!canRecognize?0.4:1}}>
                  <Fingerprint size={15}/>Wer spricht?
                </button>

                {result && (
                  <div className="card p-5 fade-up"
                    style={{border:`1px solid ${result.matched?'rgba(16,185,129,0.3)':'rgba(239,68,68,0.3)'}`,background:result.matched?'rgba(16,185,129,0.06)':'rgba(239,68,68,0.06)'}}>
                    <div className="text-center mb-5">
                      <div style={{fontSize:48,lineHeight:1,marginBottom:8}}>{result.matched?'✅':'❓'}</div>
                      <div style={{fontFamily:'Syne,sans-serif',fontWeight:800,fontSize:30,letterSpacing:'-0.03em',color:result.matched?'var(--green)':'var(--red)'}}>
                        {result.matched?result.matchedSpeaker:'Unbekannt'}
                      </div>
                      <div className="text-sm mt-1" style={{color:'var(--muted)'}}>
                        Cosine-Similarity: {result.confidence}% {result.matched?'≥ 75% Schwelle':'< 75% Schwelle'}
                      </div>
                    </div>
                    <div className="space-y-2.5">
                      {result.scores.map(s=>{
                        const sp = speakers.find(x=>x.name===s.name)
                        const isTop = s.name===result.matchedSpeaker
                        return (
                          <div key={s.name}>
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-2">
                                {sp&&<div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold"
                                  style={{background:sp.color+'25',color:sp.color}}>{sp.name[0]}</div>}
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
