'use client'
import { useState, useRef, useCallback, DragEvent, ChangeEvent } from 'react'
import AppLayout from '@/components/AppLayout'
import { Upload, X, ShieldCheck, AlertTriangle, Mic, MicOff, CheckCircle } from 'lucide-react'

const SPACE_URL = 'https://kibrisli123-voicesense-detect.hf.space'
const FFT_SIZE = 2048
const BARS = 48

interface Result {
  isFake: boolean; confidence: number; fakeScore: number; realScore: number; verdict: string; error?: string
}
interface QueueItem {
  id: string; file: File; status: 'pending'|'analyzing'|'done'|'error'; result?: Result; error?: string
}

const ACCEPTED = ['mp3','wav','ogg','flac','m4a','aac']
const fmt = (b: number) => b < 1048576 ? (b/1024).toFixed(1)+' KB' : (b/1048576).toFixed(2)+' MB'

export default function UploadPage() {
  const [activeTab, setActiveTab] = useState<'live'|'file'>('file')

  // File mode
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [selected, setSelected] = useState<string|null>(null)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Live mode
  const [isLive, setIsLive] = useState(false)
  const [liveSeconds, setLiveSeconds] = useState(0)
  const [liveBars, setLiveBars] = useState<number[]>(Array(BARS).fill(2))
  const [liveResult, setLiveResult] = useState<Result|null>(null)
  const [liveLoading, setLiveLoading] = useState(false)
  const [hasLiveRec, setHasLiveRec] = useState(false)
  const [liveFile, setLiveFile] = useState<Blob|null>(null)

  const liveStreamRef = useRef<MediaStream|null>(null)
  const liveCtxRef = useRef<AudioContext|null>(null)
  const liveAnimRef = useRef<number|null>(null)
  const liveTimerRef = useRef<ReturnType<typeof setInterval>|null>(null)
  const mediaRecRef = useRef<MediaRecorder|null>(null)
  const chunksRef = useRef<Blob[]>([])

  const sel = queue.find(q => q.id === selected)
  const done = queue.filter(q => q.status==='done').length
  const fakes = queue.filter(q => q.result?.isFake===true).length

  // ── File analysis ──────────────────────────────────────────
  function add(files: FileList | File[]) {
    const valid = Array.from(files).filter(f => ACCEPTED.includes(f.name.split('.').pop()?.toLowerCase()||''))
    setQueue(q => [...q, ...valid.map(f => ({id:Math.random().toString(36).slice(2),file:f,status:'pending' as const}))])
  }

  const analyze = useCallback(async (id: string) => {
    const item = queue.find(q => q.id===id)
    if (!item||item.status!=='pending') return
    setQueue(q => q.map(x => x.id===id ? {...x,status:'analyzing'} : x))
    setSelected(id)
    try {
      const fd = new FormData()
      fd.append('file', item.file)
      const res = await fetch(`${SPACE_URL}/detect`, {method:'POST',body:fd})
      if (!res.ok) throw new Error(`Fehler ${res.status}`)
      const data: Result = await res.json()
      if (data.error) throw new Error(data.error)
      setQueue(q => q.map(x => x.id===id ? {...x,status:'done',result:data} : x))
    } catch(e) {
      setQueue(q => q.map(x => x.id===id ? {...x,status:'error',error:e instanceof Error?e.message:String(e)} : x))
    }
  }, [queue])

  // ── Live analysis ──────────────────────────────────────────
  async function startLive() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({audio:{sampleRate:16000},video:false})
      liveStreamRef.current = stream
      const ctx = new AudioContext({sampleRate:16000})
      liveCtxRef.current = ctx
      const analyser = ctx.createAnalyser()
      analyser.fftSize = FFT_SIZE
      analyser.smoothingTimeConstant = 0.2
      ctx.createMediaStreamSource(stream).connect(analyser)
      const dataArr = new Float32Array(analyser.frequencyBinCount)

      // MediaRecorder to capture actual audio blob
      const mr = new MediaRecorder(stream, {mimeType:'audio/webm'})
      mediaRecRef.current = mr
      chunksRef.current = []
      mr.ondataavailable = e => { if(e.data.size>0) chunksRef.current.push(e.data) }
      mr.start(100)

      setIsLive(true); setLiveSeconds(0); setHasLiveRec(false); setLiveResult(null)
      liveTimerRef.current = setInterval(() => setLiveSeconds(s=>s+1), 1000)

      const drawLoop = () => {
        analyser.getFloatFrequencyData(dataArr)
        const mag = Array.from(dataArr).map(db => Math.min(100, Math.max(0,(db+100))))
        const step = Math.floor(mag.length/BARS)
        setLiveBars(Array(BARS).fill(0).map((_,i) => mag.slice(i*step,(i+1)*step).reduce((a,b)=>Math.max(a,b),0)))
        liveAnimRef.current = requestAnimationFrame(drawLoop)
      }
      liveAnimRef.current = requestAnimationFrame(drawLoop)
    } catch { alert('Mikrofon-Zugriff verweigert. Bitte in Browser-Einstellungen erlauben.') }
  }

  function stopLive() {
    if (liveAnimRef.current) cancelAnimationFrame(liveAnimRef.current)
    if (liveTimerRef.current) clearInterval(liveTimerRef.current)
    mediaRecRef.current?.stop()
    setTimeout(() => {
      const blob = new Blob(chunksRef.current, {type:'audio/webm'})
      setLiveFile(blob)
      setHasLiveRec(true)
    }, 200)
    liveStreamRef.current?.getTracks().forEach(t=>t.stop())
    liveCtxRef.current?.close()
    setIsLive(false)
  }

  async function analyzeLive() {
    if (!liveFile) return
    setLiveLoading(true)
    try {
      const fd = new FormData()
      fd.append('file', liveFile, 'live-recording.webm')
      const res = await fetch(`${SPACE_URL}/detect`, {method:'POST',body:fd})
      if (!res.ok) throw new Error(`Space Fehler ${res.status}`)
      const data: Result = await res.json()
      setLiveResult(data)
    } catch(e) { alert('Fehler: '+e) }
    setLiveLoading(false)
  }

  function ResultCard({r}: {r: Result}) {
    return (
      <div className="space-y-4">
        <div className={`card p-6 text-center ${r.isFake?'glow-red':'glow-green'}`}
          style={{border:`1px solid ${r.isFake?'rgba(239,68,68,0.3)':'rgba(16,185,129,0.3)'}`,background:r.isFake?'rgba(239,68,68,0.06)':'rgba(16,185,129,0.06)'}}>
          <div style={{fontSize:52,lineHeight:1,marginBottom:12}}>{r.isFake?'⚠️':'✅'}</div>
          <div style={{fontFamily:'Syne,sans-serif',fontWeight:800,fontSize:'clamp(28px,7vw,40px)',letterSpacing:'-0.03em',color:r.isFake?'var(--red)':'var(--green)',lineHeight:1,marginBottom:8}}>
            {r.isFake?'FAKE':'ECHT'}
          </div>
          <div className="text-sm mb-3" style={{color:'var(--muted)'}}>
            {r.isFake?'KI-generierte Stimme erkannt':'Echte menschliche Stimme'}
          </div>
          <div style={{fontFamily:'Syne,sans-serif',fontWeight:700,fontSize:36,color:'white'}}>{r.confidence}%</div>
          <div className="text-xs mt-0.5" style={{color:'var(--dimmed)'}}>Konfidenz</div>
          <div className="mt-4 h-2.5 rounded-full overflow-hidden" style={{background:'rgba(255,255,255,0.08)'}}>
            <div className="h-full rounded-full" style={{width:`${r.confidence}%`,background:r.isFake?'var(--red)':'var(--green)'}}/>
          </div>
        </div>
        <div className="card p-5 space-y-3">
          {[{l:'Spoof (Fake)',v:r.fakeScore,c:'var(--red)'},{l:'Bonafide (Echt)',v:r.realScore,c:'var(--green)'}].map(s=>(
            <div key={s.l}>
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-xs" style={{color:'var(--muted)'}}>{s.l}</span>
                <span className="text-sm font-bold font-mono" style={{color:s.c}}>{s.v}%</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{background:'rgba(255,255,255,0.06)'}}>
                <div className="h-full rounded-full" style={{width:`${s.v}%`,background:s.c}}/>
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between pt-3" style={{borderTop:'1px solid var(--border)'}}>
            <div className="flex items-center gap-1.5">
              <ShieldCheck size={13} style={{color:'var(--blue)'}}/>
              <span className="text-xs font-mono" style={{color:'var(--dimmed)'}}>DF_Arena_1B_V_1</span>
            </div>
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full"
              style={{background:r.isFake?'rgba(239,68,68,0.15)':'rgba(16,185,129,0.15)',color:r.isFake?'var(--red)':'var(--green)'}}>
              {r.verdict}
            </span>
          </div>
        </div>
        {r.isFake && (
          <div className="card p-4" style={{border:'1px solid rgba(239,68,68,0.15)'}}>
            <div className="text-xs font-semibold mb-2" style={{color:'var(--red)'}}>Mögliche KI-Quellen</div>
            <div className="flex flex-wrap gap-1.5">
              {['ElevenLabs','RVC Clone','XTTS / Bark','GAN Deepfake','Neural TTS'].map(t=>(
                <span key={t} className="text-xs px-2.5 py-1 rounded-lg"
                  style={{background:'rgba(239,68,68,0.08)',color:'rgba(239,68,68,0.7)',border:'1px solid rgba(239,68,68,0.15)'}}>
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <AppLayout>
      <div className="p-4 md:p-8 max-w-3xl mx-auto">
        <div className="mb-6 fade-up">
          <h1 style={{fontFamily:'Syne,sans-serif',fontWeight:800,fontSize:'clamp(22px,5vw,32px)',letterSpacing:'-0.03em'}} className="text-white">
            Deepfake-Erkennung
          </h1>
          <p className="text-sm mt-1" style={{color:'var(--muted)'}}>Echte oder KI-generierte Stimme — Live oder Datei</p>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-1 p-1 rounded-2xl mb-6 fade-up-1" style={{background:'var(--surface)'}}>
          {[{id:'file' as const,icon:Upload,label:'Datei hochladen'},{id:'live' as const,icon:Mic,label:'Live aufnehmen'}].map(t=>(
            <button key={t.id} onClick={()=>setActiveTab(t.id)}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold transition-all"
              style={{background:activeTab===t.id?'rgba(37,99,235,0.2)':'transparent',color:activeTab===t.id?'var(--blue)':'var(--muted)',border:activeTab===t.id?'1px solid rgba(37,99,235,0.3)':'1px solid transparent'}}>
              <t.icon size={13}/>{t.label}
            </button>
          ))}
        </div>

        {/* ── FILE TAB ── */}
        {activeTab === 'file' && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3 fade-up-1">
              {[{l:'Analysiert',v:done,c:'var(--blue)'},{l:'Fake',v:fakes,c:'var(--red)'},{l:'Echt',v:done-fakes,c:'var(--green)'}].map(s=>(
                <div key={s.l} className="card p-4 text-center">
                  <div style={{fontSize:26,fontWeight:700,color:s.c,fontFamily:'Syne,sans-serif'}}>{s.v}</div>
                  <div className="text-xs mt-0.5" style={{color:'var(--dimmed)'}}>{s.l}</div>
                </div>
              ))}
            </div>

            <div onDrop={e=>{e.preventDefault();setDragging(false);add(e.dataTransfer.files)}}
              onDragOver={e=>{e.preventDefault();setDragging(true)}} onDragLeave={()=>setDragging(false)}
              onClick={()=>inputRef.current?.click()}
              className="fade-up-1 cursor-pointer rounded-2xl border-2 border-dashed transition-all flex flex-col items-center justify-center gap-4 py-10"
              style={{borderColor:dragging?'var(--blue)':'var(--border2)',background:dragging?'rgba(37,99,235,0.06)':'var(--surface)'}}>
              <input ref={inputRef} type="file" multiple accept={ACCEPTED.map(e=>'.'+e).join(',')} className="hidden"
                onChange={(e:ChangeEvent<HTMLInputElement>)=>{if(e.target.files)add(e.target.files);e.target.value=''}}/>
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{background:dragging?'rgba(37,99,235,0.2)':'rgba(255,255,255,0.05)'}}>
                <Upload size={26} style={{color:dragging?'var(--blue)':'var(--dimmed)'}}/>
              </div>
              <div className="text-center">
                <div className="font-semibold text-white">{dragging?'Loslassen…':'Audiodatei hochladen'}</div>
                <div className="text-xs mt-1" style={{color:'var(--muted)'}}>Drag & Drop oder tippen</div>
              </div>
              <div className="flex gap-1.5 flex-wrap justify-center">
                {ACCEPTED.map(e=><span key={e} className="text-xs px-2 py-0.5 rounded font-mono" style={{background:'rgba(255,255,255,0.05)',color:'var(--dimmed)'}}>  .{e}</span>)}
              </div>
            </div>

            {queue.length > 0 && (
              <div className="card p-4 space-y-2 fade-up">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-semibold text-white">{queue.length} Datei{queue.length!==1?'en':''}</span>
                  <div className="flex gap-2">
                    {queue.some(q=>q.status==='pending') && (
                      <button onClick={()=>queue.filter(q=>q.status==='pending').forEach(q=>analyze(q.id))}
                        className="text-xs px-3 py-1.5 rounded-lg font-medium"
                        style={{background:'rgba(37,99,235,0.15)',color:'var(--blue)',border:'1px solid rgba(37,99,235,0.3)'}}>
                        Alle analysieren
                      </button>
                    )}
                    <button onClick={()=>{setQueue([]);setSelected(null)}}
                      className="text-xs px-2.5 py-1.5 rounded-lg" style={{border:'1px solid var(--border)',color:'var(--muted)'}}>
                      Leeren
                    </button>
                  </div>
                </div>
                {queue.map(item=>(
                  <div key={item.id} onClick={()=>(item.status==='done'||item.status==='error')&&setSelected(item.id)}
                    className="flex items-center gap-3 p-3 rounded-xl transition-all"
                    style={{background:selected===item.id?'rgba(37,99,235,0.1)':'rgba(255,255,255,0.03)',border:`1px solid ${selected===item.id?'rgba(37,99,235,0.3)':'var(--border)'}`,cursor:item.status==='done'||item.status==='error'?'pointer':'default'}}>
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-lg" style={{background:'rgba(255,255,255,0.05)'}}>🎵</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-white truncate">{item.file.name}</div>
                      <div className="text-xs" style={{color:'var(--dimmed)'}}>{fmt(item.file.size)}</div>
                    </div>
                    {item.status==='pending' && <button onClick={e=>{e.stopPropagation();analyze(item.id)}} className="text-xs px-2.5 py-1 rounded-lg font-medium flex-shrink-0" style={{background:'rgba(37,99,235,0.15)',color:'var(--blue)',border:'1px solid rgba(37,99,235,0.3)'}}>Start</button>}
                    {item.status==='analyzing' && <div className="w-4 h-4 rounded-full border-2 spin flex-shrink-0" style={{borderColor:'rgba(37,99,235,0.3)',borderTopColor:'var(--blue)'}}/>}
                    {item.status==='done' && item.result && <span className="text-xs font-bold flex-shrink-0" style={{color:item.result.isFake?'var(--red)':'var(--green)'}}>{item.result.isFake?'FAKE':'ECHT'}</span>}
                    {item.status==='error' && <span className="text-xs flex-shrink-0" style={{color:'var(--red)'}}>Fehler</span>}
                    <button onClick={e=>{e.stopPropagation();setQueue(q=>q.filter(x=>x.id!==item.id));if(selected===item.id)setSelected(null)}} style={{color:'var(--dimmed)'}}><X size={14}/></button>
                  </div>
                ))}
              </div>
            )}

            {sel?.status==='analyzing' && (
              <div className="card p-8 text-center fade-up">
                <div className="w-12 h-12 rounded-full border-2 spin mx-auto mb-4" style={{borderColor:'rgba(37,99,235,0.2)',borderTopColor:'var(--blue)'}}/>
                <div className="font-semibold text-white">Analysiere…</div>
                <div className="text-sm mt-1" style={{color:'var(--muted)'}}>Erste Analyse: ~60s</div>
              </div>
            )}
            {sel?.status==='error' && (
              <div className="card p-5 fade-up" style={{border:'1px solid rgba(239,68,68,0.25)',background:'rgba(239,68,68,0.06)'}}>
                <div className="flex items-center gap-2 font-semibold mb-1" style={{color:'var(--red)'}}><AlertTriangle size={16}/>Fehler</div>
                <div className="text-sm" style={{color:'var(--muted)'}}>{sel.error}</div>
              </div>
            )}
            {sel?.result && <ResultCard r={sel.result}/>}
          </div>
        )}

        {/* ── LIVE TAB ── */}
        {activeTab === 'live' && (
          <div className="space-y-4 fade-up">
            <div className="card p-4">
              <div className="text-xs font-semibold uppercase tracking-wider mb-3" style={{color:'var(--dimmed)'}}>Live-Wellenform</div>
              <div className="rounded-xl mb-4 flex items-end gap-[1px] px-2 py-2 overflow-hidden" style={{height:72,background:'#08080f'}}>
                {liveBars.map((h,i)=>(
                  <div key={i} className="flex-1 rounded-t-sm transition-all"
                    style={{height:`${Math.max(2,h)}%`,background:isLive?'var(--blue)':'#1e1e30',transitionDuration:'80ms'}}/>
                ))}
              </div>
              {isLive && (
                <div className="text-center mb-3">
                  <div className="text-2xl font-mono font-bold text-white">
                    {String(Math.floor(liveSeconds/60)).padStart(2,'0')}:{String(liveSeconds%60).padStart(2,'0')}
                  </div>
                  <div className="text-xs mt-0.5 flex items-center justify-center gap-1.5" style={{color:'var(--red)'}}>
                    <span className="w-1.5 h-1.5 rounded-full blink" style={{background:'var(--red)'}}/>Aufnahme läuft
                  </div>
                </div>
              )}
              {!isLive && hasLiveRec && (
                <div className="text-center mb-3 text-xs" style={{color:'var(--green)'}}>
                  <CheckCircle size={14} className="inline mr-1"/> {liveSeconds}s aufgenommen — bereit zur Analyse
                </div>
              )}
              <button onClick={isLive ? stopLive : startLive}
                className="w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all mb-2"
                style={isLive
                  ? {background:'rgba(239,68,68,0.15)',color:'var(--red)',border:'1px solid rgba(239,68,68,0.3)'}
                  : {background:'rgba(255,255,255,0.05)',color:'white',border:'1px solid var(--border2)'}}>
                {isLive ? <><MicOff size={15}/>Aufnahme stoppen</> : <><Mic size={15}/>Live aufnehmen</>}
              </button>
              <button onClick={analyzeLive} disabled={!hasLiveRec||liveLoading}
                className="w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all"
                style={{background:'rgba(37,99,235,0.2)',color:'var(--blue)',border:'1px solid rgba(37,99,235,0.3)',opacity:(!hasLiveRec||liveLoading)?0.4:1}}>
                {liveLoading
                  ? <><div className="w-4 h-4 rounded-full border-2 spin" style={{borderColor:'rgba(37,99,235,0.3)',borderTopColor:'var(--blue)'}}/>Analysiere (~60s)…</>
                  : <><ShieldCheck size={15}/>Jetzt analysieren</>}
              </button>
            </div>

            <div className="card p-4 text-xs leading-relaxed" style={{color:'var(--dimmed)'}}>
              <div className="font-semibold text-white mb-1">Wie es funktioniert</div>
              Aufnahme starten → Stimme sprechen → Stoppen → Analysieren. Das Modell DF_Arena_1B_V_1 prüft ob die Stimme echt oder KI-generiert ist.
              <div className="mt-2" style={{color:'rgba(239,68,68,0.6)'}}>⚠ Erste Analyse: ~60s (Modell lädt)</div>
            </div>

            {liveLoading && (
              <div className="card p-8 text-center">
                <div className="w-12 h-12 rounded-full border-2 spin mx-auto mb-4" style={{borderColor:'rgba(37,99,235,0.2)',borderTopColor:'var(--blue)'}}/>
                <div className="font-semibold text-white">Analysiere Live-Aufnahme…</div>
                <div className="text-sm mt-1" style={{color:'var(--muted)'}}>Erste Analyse kann ~60s dauern</div>
              </div>
            )}
            {liveResult && <ResultCard r={liveResult}/>}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
