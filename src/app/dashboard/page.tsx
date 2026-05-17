'use client'
import AppLayout from '@/components/AppLayout'
import { ShieldCheck, AlertTriangle, Radio, TrendingUp, Activity } from 'lucide-react'

const timeline = [
  {type:'fake', text:'Deepfake-Stimme erkannt', detail:'89% · GAN-Artefakte', time:'14:23', color:'var(--red)'},
  {type:'speaker', text:'Sprecher: Umur identifiziert', detail:'92% Biometrie', time:'14:18', color:'var(--amber)'},
  {type:'drone', text:'Drohnenalarm: DJI Phantom 4', detail:'Sektor NE · 85m', time:'14:11', color:'var(--red)'},
  {type:'real', text:'Echte Stimme verifiziert', detail:'Thomas · 94%', time:'13:55', color:'var(--green)'},
  {type:'drone', text:'Drohne freigegeben', detail:'Parrot Bebop · autorisiert', time:'13:40', color:'var(--green)'},
  {type:'fake', text:'TTS-Synthese erkannt', detail:'ElevenLabs-Muster', time:'13:22', color:'var(--red)'},
]

export default function Dashboard() {
  return (
    <AppLayout>
      <div className="p-4 md:p-8 max-w-3xl mx-auto">
        <div className="mb-6 fade-up">
          <h1 style={{fontFamily:'Syne,sans-serif',fontWeight:800,fontSize:'clamp(22px,5vw,32px)',letterSpacing:'-0.03em'}} className="text-white">
            Dashboard
          </h1>
          <p className="text-sm mt-1" style={{color:'var(--muted)'}}>Systemübersicht & Statistiken</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6 fade-up-1">
          {[
            {icon:Activity,     label:'Analysen heute', value:'47',   color:'var(--blue)'},
            {icon:AlertTriangle,label:'Fake erkannt',   value:'11',   color:'var(--red)'},
            {icon:Radio,        label:'Drohnenalarme',  value:'8',    color:'var(--amber)'},
            {icon:ShieldCheck,  label:'Genauigkeit',    value:'96.7%',color:'var(--green)'},
          ].map(({icon:Icon,label,value,color})=>(
            <div key={label} className="card p-4">
              <div className="flex items-center gap-2 mb-2">
                <Icon size={14} style={{color:'var(--dimmed)'}}/>
                <span className="text-xs" style={{color:'var(--dimmed)'}}>{label}</span>
              </div>
              <div style={{fontFamily:'Syne,sans-serif',fontWeight:700,fontSize:28,color,letterSpacing:'-0.02em'}}>{value}</div>
            </div>
          ))}
        </div>

        <div className="grid md:grid-cols-2 gap-4 fade-up-2">
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Activity size={15} style={{color:'var(--blue)'}}/>
              <span className="text-sm font-semibold text-white">Ereignisprotokoll</span>
            </div>
            <div className="space-y-1">
              {timeline.map((e,i)=>(
                <div key={i} className="flex items-start gap-3 py-2.5" style={{borderBottom:i<timeline.length-1?'1px solid var(--border)':'none'}}>
                  <div className="flex flex-col items-center mt-1.5">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{background:e.color}}/>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white">{e.text}</div>
                    <div className="text-xs mt-0.5" style={{color:'var(--dimmed)'}}>{e.detail}</div>
                  </div>
                  <div className="text-xs font-mono flex-shrink-0" style={{color:'var(--dimmed)'}}>{e.time}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp size={15} style={{color:'var(--blue)'}}/>
                <span className="text-sm font-semibold text-white">Modellgenauigkeit</span>
              </div>
              {[
                {label:'Deepfake-Erkennung', acc:97.2, color:'var(--blue)'},
                {label:'Sprecher-ID',        acc:94.8, color:'var(--green)'},
                {label:'Drohnenerkennung',   acc:96.1, color:'var(--amber)'},
              ].map(m=>(
                <div key={m.label} className="mb-4 last:mb-0">
                  <div className="flex justify-between text-sm mb-1.5">
                    <span style={{color:'var(--muted)'}}>{m.label}</span>
                    <span className="font-mono font-bold text-white">{m.acc}%</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{background:'rgba(255,255,255,0.06)'}}>
                    <div className="h-full rounded-full" style={{width:`${m.acc}%`,background:m.color}}/>
                  </div>
                </div>
              ))}
            </div>

            <div className="card p-5">
              <div className="text-sm font-semibold text-white mb-4">Systemstatus</div>
              {[
                {l:'DF_Arena_1B_V_1',  s:'Aktiv',   ok:true},
                {l:'Sprecher-DB',       s:'5 Profile',ok:true},
                {l:'Radar-Modul',       s:'Online',  ok:true},
                {l:'API-Verbindung',    s:'Online',  ok:true},
              ].map(s=>(
                <div key={s.l} className="flex items-center justify-between mb-2.5 last:mb-0">
                  <span className="text-sm" style={{color:'var(--muted)'}}>{s.l}</span>
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full"
                    style={{background:s.ok?'rgba(16,185,129,0.15)':'rgba(239,68,68,0.15)',color:s.ok?'var(--green)':'var(--red)'}}>
                    {s.s}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
