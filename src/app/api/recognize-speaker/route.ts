import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const { enrolledSpeakers, durationSeconds, isFileUpload, fileName } = await req.json()

    if (!enrolledSpeakers || enrolledSpeakers.length === 0) {
      return NextResponse.json({ error: 'Keine Sprecher vorhanden' }, { status: 400 })
    }

    // Always extract plain strings — handle both string[] and object[] defensively
    const names: string[] = enrolledSpeakers.map((s: unknown) => {
      if (typeof s === 'string') return s
      if (s && typeof s === 'object' && 'name' in s) return (s as { name: string }).name
      return String(s)
    })

    // Biometric simulation
    const f0      = parseFloat((Math.random() * 120 + 90).toFixed(1))
    const jitter  = parseFloat((Math.random() * 0.4 + 0.08).toFixed(4))
    const shimmer = parseFloat((Math.random() * 0.8 + 0.1).toFixed(4))
    const hnr     = parseFloat((Math.random() * 15 + 10).toFixed(2))
    const mfcc    = parseFloat((Math.random() * 0.25 + 0.02).toFixed(4))

    // Match decision
    const hasMatch   = Math.random() > 0.15
    const matchedName: string | null = hasMatch
      ? names[Math.floor(Math.random() * names.length)]
      : null

    // Scores — always plain { name: string, score: number }
    const scores = names.map((name: string) => ({
      name,
      score: name === matchedName
        ? Math.floor(Math.random() * 10 + 87)
        : Math.floor(Math.random() * 22 + 4),
    }))

    const confidence = matchedName
      ? scores.find(s => s.name === matchedName)!.score
      : Math.max(...scores.map(s => s.score))

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: `Du bist ein Sprechererkennungssystem. Analysiere diese Stimmprobe auf Deutsch.

${isFileUpload ? `Datei: "${fileName}"` : `Aufnahme: ${durationSeconds}s`}

Messwerte: F0=${f0}Hz, Jitter=${jitter}%, Shimmer=${shimmer}dB, HNR=${hnr}dB, MFCC-Distanz=${mfcc}

Personen in der Datenbank: ${names.join(', ')}
Ergebnis: ${matchedName ? `"${matchedName}" erkannt mit ${confidence}%` : 'Unbekannte Person'}

Erkläre in 2 kurzen Sätzen auf Deutsch warum ${matchedName ? `"${matchedName}"` : 'keine Person'} erkannt wurde.`
      }]
    })

    const analysis = message.content.map(c => c.type === 'text' ? c.text : '').join('')

    return NextResponse.json({
      matched: !!matchedName,
      matchedSpeaker: matchedName,   // string | null — NEVER an object
      confidence,
      scores,                        // { name: string, score: number }[]
      features: { f0, jitter, shimmer, hnr, mfccDist: mfcc },
      analysis,
      timestamp: new Date().toISOString(),
    })

  } catch (error) {
    console.error('recognize-speaker error:', error)
    return NextResponse.json({ error: 'Erkennung fehlgeschlagen' }, { status: 500 })
  }
}
