import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const DRONE_MODELS = ['DJI Phantom 4', 'DJI Mavic 3', 'Parrot Bebop 2', 'Autel EVO Nano', 'Unbekannt']
const SECTORS = ['Nord', 'NordOst', 'Ost', 'SüdOst', 'Süd', 'SüdWest', 'West', 'NordWest']

function randomDrone() {
  const model = DRONE_MODELS[Math.floor(Math.random() * DRONE_MODELS.length)]
  const sector = SECTORS[Math.floor(Math.random() * SECTORS.length)]
  const altitude = Math.floor(Math.random() * 120) + 20
  const speed = Math.floor(Math.random() * 18) + 3
  const probability = Math.floor(Math.random() * 25) + 72
  const authorized = model !== 'Unbekannt' && Math.random() > 0.5
  const threat = !authorized && probability > 85 ? 'high' : !authorized ? 'medium' : 'low'
  const distance = Math.floor(Math.random() * 400) + 50
  return { model, sector, altitude, speed, probability, authorized, threat, distance }
}

export async function POST(req: NextRequest) {
  try {
    const count = Math.floor(Math.random() * 2) + 1
    const drones = Array.from({ length: count }, randomDrone)
    const threats = drones.filter(d => d.threat === 'high').length
    const unknowns = drones.filter(d => d.model === 'Unbekannt').length

    const droneList = drones.map((d, i) =>
      `${i + 1}. ${d.model} · Sektor ${d.sector} · ${d.altitude}m · ${d.speed}m/s · ${d.probability}% · ${d.authorized ? 'Autorisiert' : 'NICHT AUTORISIERT'}`
    ).join('\n')

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: `Du bist ein militärisches Echtzeit-Radar-Drohnenerkennungssystem für einen Schutzradius von 500m.

Aktuelle Radar-Erfassung:
${droneList}

Statistik: ${threats} Hochbedrohung, ${unknowns} unbekannte Objekte, ${drones.length - threats} unkritisch

Erstelle eine operative Lageeinschätzung auf Deutsch (4 Sätze):
1. Gesamtbedrohungsstufe (ROT/GELB/GRÜN)
2. Priorisierung der Objekte nach Gefährlichkeit
3. Empfohlene Sofortmaßnahmen
4. Systemstatus und nächste Scan-Empfehlung`
      }]
    })

    const analysis = message.content.map(c => c.type === 'text' ? c.text : '').join('')

    return NextResponse.json({
      drones,
      threats,
      unknowns,
      totalScanned: drones.length,
      analysis,
      radarStatus: 'AKTIV',
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Radar-Analyse fehlgeschlagen' }, { status: 500 })
  }
}
