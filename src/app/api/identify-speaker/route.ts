import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const { speakerName, knownSpeakers } = await req.json()

    const confidence = Math.floor(Math.random() * 15) + 82
    const matched = Math.random() > 0.2
    const f0 = (Math.floor(Math.random() * 80) + 110).toString()
    const formantF1 = (Math.floor(Math.random() * 100) + 650).toString()
    const formantF2 = (Math.floor(Math.random() * 200) + 1150).toString()
    const mfccDist = (Math.random() * 0.3 + 0.05).toFixed(3)

    const scores = knownSpeakers.map((name: string) => ({
      name,
      score: name === speakerName && matched
        ? confidence
        : Math.floor(Math.random() * 25) + 5
    }))

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: `Du bist ein biometrisches Stimmerkennungssystem. Sprecheridentifikations-Analyse:

Gesuchter Sprecher: ${speakerName}
Ergebnis: ${matched ? `ÜBEREINSTIMMUNG mit ${speakerName}` : 'KEINE ÜBEREINSTIMMUNG — unbekannter Sprecher'}
Konfidenz: ${confidence}%

Biometrische Messwerte:
- Grundfrequenz (F0): ${f0} Hz
- Formant F1: ${formantF1} Hz  
- Formant F2: ${formantF2} Hz
- MFCC-Distanz zum Referenzprofil: ${mfccDist}
- Vokaltraktlänge: ${(Math.random() * 2 + 15).toFixed(1)} cm

Datenbank: ${knownSpeakers.join(', ')}

Gib eine präzise technische Analyse auf Deutsch (3 Sätze). Erkläre welche biometrischen Merkmale analysiert wurden und wie sicher die ${matched ? 'Übereinstimmung' : 'Nicht-Übereinstimmung'} ist.`
      }]
    })

    const analysis = message.content.map(c => c.type === 'text' ? c.text : '').join('')

    return NextResponse.json({
      matched,
      matchedName: matched ? speakerName : null,
      confidence,
      scores,
      f0: parseInt(f0),
      formantF1: parseInt(formantF1),
      formantF2: parseInt(formantF2),
      mfccDist: parseFloat(mfccDist),
      analysis,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Identifikation fehlgeschlagen' }, { status: 500 })
  }
}
