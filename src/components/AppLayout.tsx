'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Users, Radio, Upload, Shield } from 'lucide-react'

const nav = [
  { href: '/upload',  icon: Upload, label: 'Deepfake',  sub: 'Echt oder KI' },
  { href: '/speaker', icon: Users,  label: 'Sprecher',  sub: 'ID & Erkennung' },
  { href: '/drone',   icon: Radio,  label: 'Drohnen',   sub: 'YAMNet · Live & Upload' },
]

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname()
  return (
    <div className="flex min-h-screen">
      <aside className="sidebar w-60 min-h-screen flex flex-col border-r border-[var(--border)] bg-[var(--surface)]" style={{position:'sticky',top:0,height:'100vh'}}>
        <div className="px-5 py-6 border-b border-[var(--border)]">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[var(--blue)] flex items-center justify-center flex-shrink-0">
              <Shield size={17} className="text-white" />
            </div>
            <div>
              <div style={{fontFamily:'Syne,sans-serif',fontWeight:700,fontSize:15,letterSpacing:'-0.02em'}} className="text-white">VoiceSense Pro</div>
              <div className="text-xs flex items-center gap-1.5 mt-0.5" style={{color:'var(--dimmed)'}}>
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--green)] inline-block"/>Live aktiv
              </div>
            </div>
          </Link>
        </div>
        <nav className="flex-1 p-3 flex flex-col gap-0.5">
          {nav.map(({ href, icon: Icon, label, sub }) => {
            const active = path.startsWith(href)
            return (
              <Link key={href} href={href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${active ? 'bg-[var(--blue)]/15 text-white border border-[var(--blue)]/25' : 'text-[var(--muted)] hover:text-white hover:bg-white/5 border border-transparent'}`}>
                <Icon size={16} style={active ? {color:'var(--blue)'} : {}} />
                <div>
                  <div className="text-sm font-medium leading-none">{label}</div>
                  <div className="text-xs mt-0.5" style={{color:'var(--dimmed)'}}>{sub}</div>
                </div>
              </Link>
            )
          })}
        </nav>
        <div className="p-4 border-t border-[var(--border)]">
          <div className="text-xs text-center" style={{color:'var(--dimmed)'}}>YAMNet + DF_Arena_1B_V_1</div>
        </div>
      </aside>
      <main className="flex-1 overflow-auto pb-24 md:pb-0">{children}</main>
      <div className="bottom-nav fixed bottom-0 left-0 right-0 z-50 border-t border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur-xl px-2 py-2 justify-around items-center">
        {nav.map(({ href, icon: Icon, label }) => {
          const active = path.startsWith(href)
          return (
            <Link key={href} href={href} className={`flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-all ${active ? 'text-white' : 'text-[var(--dimmed)]'}`}>
              <Icon size={20} style={active ? {color:'var(--blue)'} : {}} />
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
