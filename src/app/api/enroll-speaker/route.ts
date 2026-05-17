import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const { name, durationSeconds, recordingNumber } = await req.json()

    if (!name || name.trim().length < 2) {
      return NextResponse.json({ error: 'Name zu kurz' }, { status: 400 })
    }

    // Extract simulated voice fingerprint features
    const f0 = parseFloat((Math.random() * 120 + 90).toFixed(1))          // Hz
    const f0Std = parseFloat((Math.random() * 8 + 2).toFixed(2))
    const f1 = parseFloat((Math.random() * 150 + 600).toFixed(1))
    const f2 = parseFloat((Math.random() * 300 + 1100).toFixed(1))
    const f3 = parseFloat((Math.random() * 200 + 2400).toFixed(1))
    const jitter = parseFloat((Math.random() * 0.4 + 0.08).toFixed(4))
    const shimmer = parseFloat((Math.random() * 0.8 + 0.1).toFixed(4))
    const hnr = parseFloat((Math.random() * 15 + 10).toFixed(2))           // Harmonics-to-Noise Ratio
    const mfcc = Array.from({length: 13}, () => parseFloat((Math.random() * 20 - 10).toFixed(3)))
    const spectralCentroid = parseFloat((Math.random() * 800 + 1200).toFixed(1))
    const vocalTractLength = parseFloat((Math.random() * 3 + 14).toFixed(2))
    const speakingRate = parseFloat((Math.random() * 1.5 + 3.5).toFixed(2)) // syllables/sec

    const fingerprint = {
      f0, f0Std, f1, f2, f3,
      jitter, shimmer, hnr,
      mfcc,
      spectralCentroid,
      vocalTractLength,
      speakingRate,
      enrolledAt: new Date().toISOString(),
      recordingNumber,
      durationSeconds,
    }

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: `Du bist VoiceSense Pro. ${name} wurde gerade für die Sprecherdatenbank registriert.

Biometrische Merkmale (Aufnahme ${recordingNumber}/2):
- Grundfrequenz F0: ${f0} Hz (±${f0Std})
- Formanten: F1=${f1}Hz, F2=${f2}Hz, F3=${f3}Hz
- Jitter: ${jitter}%, Shimmer: ${shimmer}dB, HNR: ${hnr}dB
- Vokaltraktlänge: ${vocalTractLength}cm
- Sprechrate: ${speakingRate} Silben/Sek
- Aufnahmedauer: ${durationSeconds}s

${recordingNumber === 1
  ? `Gib eine kurze Bestätigung auf Deutsch (2 Sätze): Erste Stimmprobe von ${name} erfasst. Bitte zweite Aufnahme für robusteres Profil.`
  : `Gib eine kurze Bestätigung auf Deutsch (2 Sätze): Zweite Probe erfasst, Stimmabdruck für ${name} vollständig erstellt und in Datenbank gespeichert.`
}`
      }]
    })

    const message_text = message.content.map(c => c.type === 'text' ? c.text : '').join('')

    return NextResponse.json({
      success: true,
      name: name.trim(),
      fingerprint,
      recordingNumber,
      complete: recordingNumber >= 2,
      message: message_text,
    })

  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Registrierung fehlgeschlagen' }, { status: 500 })
  }
}
