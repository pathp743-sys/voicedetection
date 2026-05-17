'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Users, Radio, LayoutDashboard, Shield, Upload } from 'lucide-react'

const nav = [
  { href: '/speaker',   icon: Users,           label: 'Sprecher-ID',      sub: 'Erkennen & Speichern' },
  { href: '/drone',     icon: Radio,           label: 'Drohnenerkennung', sub: 'Akustisch · Live & Upload' },
  { href: '/upload',    icon: Upload,          label: 'Datei-Analyse',    sub: 'Deepfake erkennen' },
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard',        sub: 'Statistiken' },
]

export default function Sidebar() {
  const path = usePathname()
  return (
    <aside className="w-64 min-h-screen glass-card border-r border-white/8 flex flex-col">
      <div className="p-6 border-b border-white/8">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
            <Shield size={16} className="text-white" />
          </div>
          <div>
            <div className="font-semibold text-sm text-white">VoiceSense Pro</div>
            <div className="text-xs text-white/40 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#3b9e75] animate-pulse-dot inline-block" />
              Live · KI aktiv
            </div>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-4 flex flex-col gap-1">
        {nav.map(({ href, icon: Icon, label, sub }) => {
          const active = path.startsWith(href)
          return (
            <Link key={href} href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${
                active
                  ? 'bg-accent/15 border border-accent/30 text-white'
                  : 'text-white/50 hover:text-white/80 hover:bg-white/5 border border-transparent'
              }`}>
              <Icon size={17} className={active ? 'text-accent' : ''} />
              <div>
                <div className="text-sm font-medium leading-tight">{label}</div>
                <div className="text-xs opacity-50">{sub}</div>
              </div>
            </Link>
          )
        })}
      </nav>

      <div className="p-4 border-t border-white/8">
        <div className="text-xs text-white/15 text-center">v1.0</div>
      </div>
    </aside>
  )
}
