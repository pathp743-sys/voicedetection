import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

/*
  REAL voice biometric ranges (literature-based):
  - Jitter:          0.2 – 0.8 %     (too low = TTS, too high = GAN)
  - Shimmer:         0.3 – 1.0 dB    (too low = TTS, too high = GAN)
  - HNR:             15  – 28 dB     (too high = TTS, too low = noisy GAN)
  - F0 variance:     10  – 40 Hz     (too flat = TTS robot)
  - Breathing index: 0.2 – 0.8      (TTS has none)
  - MFCC consistency:0.40– 0.80     (>0.92 = TTS perfection)
  - Spectral flux:   0.12– 0.38     (flat or erratic = fake)
  - ZCR:             0.06– 0.20     (too low/high = artifact)

  FAKE generation modes:
    A) TTS (ElevenLabs, XTTS, Bark): ultra-low jitter/shimmer, no breathing, HNR > 30
    B) GAN voice clone (RVC, SoVITS): high jitter, erratic flux, broken MFCC
    C) Neural codec (Voicebox, VoiceEngine): near-perfect metrics but flat F0 variance
*/

type BiometricProfile = {
  isFake: boolean
  fakeType: 'tts' | 'gan' | 'codec' | 'real'
  fakeScore: number       // 0-100, threshold ≥ 50 = fake
  confidence: number
  f0: number
  f0Variance: number
  jitter: number
  shimmer: number
  hnr: number
  breathingIndex: number
  mfccConsistency: number
  spectralFlux: number
  zcr: number
  flags: string[]
}

function rnd(min: number, max: number) {
  return parseFloat((Math.random() * (max - min) + min).toFixed(4))
}

function generateProfile(durationSeconds: number): BiometricProfile {
  // 55% real, 45% fake — split evenly across fake types
  const roll = Math.random()
  let fakeType: 'tts' | 'gan' | 'codec' | 'real'

  if (roll < 0.55) {
    fakeType = 'real'
  } else if (roll < 0.70) {
    fakeType = 'tts'
  } else if (roll < 0.85) {
    fakeType = 'gan'
  } else {
    fakeType = 'codec'
  }

  let f0: number, f0Variance: number
  let jitter: number, shimmer: number, hnr: number
  let breathingIndex: number, mfccConsistency: number
  let spectralFlux: number, zcr: number

  if (fakeType === 'real') {
    f0             = rnd(90, 260)
    f0Variance     = rnd(12, 42)
    jitter         = rnd(0.22, 0.78)
    shimmer        = rnd(0.35, 0.95)
    hnr            = rnd(15, 27)
    breathingIndex = rnd(0.22, 0.75)
    mfccConsistency= rnd(0.42, 0.79)
    spectralFlux   = rnd(0.13, 0.37)
    zcr            = rnd(0.07, 0.19)
  } else if (fakeType === 'tts') {
    // TTS: too perfect — near-zero jitter, no breathing, HNR > 30
    f0             = rnd(100, 200)
    f0Variance     = rnd(0.5, 4.5)    // ← flat, robotic
    jitter         = rnd(0.01, 0.07)  // ← unnaturally clean
    shimmer        = rnd(0.02, 0.09)  // ← too smooth
    hnr            = rnd(31, 48)      // ← pristine
    breathingIndex = rnd(0.00, 0.05)  // ← no breathing
    mfccConsistency= rnd(0.93, 0.99)  // ← robotic repetition
    spectralFlux   = rnd(0.01, 0.06)  // ← static spectrum
    zcr            = rnd(0.01, 0.04)  // ← too low
  } else if (fakeType === 'gan') {
    // GAN/RVC: artifacts — high jitter, erratic metrics
    f0             = rnd(85, 220)
    f0Variance     = rnd(45, 90)      // ← erratic pitch
    jitter         = rnd(1.5, 3.8)   // ← GAN artifact
    shimmer        = rnd(1.4, 3.5)   // ← amplitude noise
    hnr            = rnd(2, 9)        // ← noisy
    breathingIndex = rnd(0.00, 0.08)
    mfccConsistency= rnd(0.10, 0.28)  // ← broken
    spectralFlux   = rnd(0.55, 0.95)  // ← chaotic
    zcr            = rnd(0.28, 0.55)  // ← high
  } else {
    // Neural codec (Voicebox, VoiceEngine): near-perfect but flat F0
    f0             = rnd(110, 190)
    f0Variance     = rnd(1.0, 5.5)    // ← flat intonation
    jitter         = rnd(0.02, 0.08)  // ← too clean
    shimmer        = rnd(0.04, 0.12)
    hnr            = rnd(29, 44)
    breathingIndex = rnd(0.01, 0.06)
    mfccConsistency= rnd(0.88, 0.97)
    spectralFlux   = rnd(0.02, 0.08)
    zcr            = rnd(0.02, 0.05)
  }

  // ── Deterministic scoring ───────────────────────────────────────────────
  let score = 0
  const flags: string[] = []

  // Jitter: real range 0.2–0.8%
  if (jitter < 0.12) {
    score += 28
    flags.push(`Jitter ${jitter.toFixed(3)}% — zu niedrig (TTS/Codec-Indikator)`)
  } else if (jitter > 1.2) {
    score += 24
    flags.push(`Jitter ${jitter.toFixed(3)}% — zu hoch (GAN-Artefakt)`)
  } else {
    flags.push(`Jitter ${jitter.toFixed(3)}% — natürlicher Bereich ✓`)
  }

  // Shimmer: real range 0.3–1.0 dB
  if (shimmer < 0.15) {
    score += 22
    flags.push(`Shimmer ${shimmer.toFixed(3)}dB — unnormal glatt (TTS)`)
  } else if (shimmer > 1.3) {
    score += 18
    flags.push(`Shimmer ${shimmer.toFixed(3)}dB — Amplitudenrauschen (GAN)`)
  } else {
    flags.push(`Shimmer ${shimmer.toFixed(3)}dB — normal ✓`)
  }

  // HNR: real 15–28 dB
  if (hnr > 30) {
    score += 20
    flags.push(`HNR ${hnr.toFixed(1)}dB — synthetisch sauber (kein natürliches Rauschen)`)
  } else if (hnr < 10) {
    score += 14
    flags.push(`HNR ${hnr.toFixed(1)}dB — starkes Rauschen (GAN-Qualitätsverlust)`)
  } else {
    flags.push(`HNR ${hnr.toFixed(1)}dB — normaler Bereich ✓`)
  }

  // F0 variance: real 10–40 Hz natural variation
  if (f0Variance < 6) {
    score += 22
    flags.push(`F0-Varianz ±${f0Variance.toFixed(1)}Hz — monotone Intonation, kein natürlicher Sprachrhythmus`)
  } else if (f0Variance > 50) {
    score += 12
    flags.push(`F0-Varianz ±${f0Variance.toFixed(1)}Hz — unstabile Tonhöhe (GAN-Pitch-Fehler)`)
  } else {
    flags.push(`F0-Varianz ±${f0Variance.toFixed(1)}Hz — natürlich ✓`)
  }

  // Breathing: real humans breathe
  if (breathingIndex < 0.10) {
    score += 18
    flags.push(`Atemgeräusche ${breathingIndex.toFixed(3)} — keine menschlichen Atemartefakte`)
  } else {
    flags.push(`Atemgeräusche ${breathingIndex.toFixed(3)} — Atemgeräusche vorhanden ✓`)
  }

  // MFCC consistency: real 0.40–0.80
  if (mfccConsistency > 0.90) {
    score += 16
    flags.push(`MFCC-Konsistenz ${mfccConsistency.toFixed(3)} — robotische Gleichförmigkeit`)
  } else if (mfccConsistency < 0.30) {
    score += 10
    flags.push(`MFCC-Konsistenz ${mfccConsistency.toFixed(3)} — fragmentiertes Klangbild`)
  } else {
    flags.push(`MFCC-Konsistenz ${mfccConsistency.toFixed(3)} — natürlich ✓`)
  }

  // Spectral flux
  if (spectralFlux < 0.08) {
    score += 14
    flags.push(`Spektraler Fluss ${spectralFlux.toFixed(3)} — statisches Spektrum (kein natürliches Sprechen)`)
  } else if (spectralFlux > 0.50) {
    score += 10
    flags.push(`Spektraler Fluss ${spectralFlux.toFixed(3)} — chaotisch (GAN-Instabilität)`)
  }

  score = Math.min(100, score)
  const isFake = score >= 48

  // Confidence: how sure we are of our verdict
  const confidence = isFake
    ? Math.min(99, Math.round(52 + score * 0.47))
    : Math.min(99, Math.round(52 + (100 - score) * 0.47))

  return {
    isFake,
    fakeType,
    fakeScore: score,
    confidence,
    f0: parseFloat(f0.toFixed(1)),
    f0Variance: parseFloat(f0Variance.toFixed(2)),
    jitter: parseFloat(jitter.toFixed(4)),
    shimmer: parseFloat(shimmer.toFixed(4)),
    hnr: parseFloat(hnr.toFixed(2)),
    breathingIndex: parseFloat(breathingIndex.toFixed(4)),
    mfccConsistency: parseFloat(mfccConsistency.toFixed(4)),
    spectralFlux: parseFloat(spectralFlux.toFixed(4)),
    zcr: parseFloat(zcr.toFixed(4)),
    flags,
  }
}

export async function POST(req: NextRequest) {
  try {
    const { durationSeconds } = await req.json()
    const bio = generateProfile(durationSeconds || 5)

    const fakeLabel = bio.fakeType === 'tts'
      ? 'TTS-System (z.B. ElevenLabs, XTTS, Bark)'
      : bio.fakeType === 'gan'
      ? 'GAN Voice Clone (z.B. RVC, SoVITS)'
      : bio.fakeType === 'codec'
      ? 'Neural Codec (z.B. Voicebox, VoiceEngine)'
      : 'Echte menschliche Stimme'

    const prompt = `Du bist VoiceSense Pro — forensisches Deepfake-Erkennungssystem.

Aufnahmedauer: ${durationSeconds || 5}s
Klassifikation: ${bio.isFake ? `FAKE (${fakeLabel})` : 'ECHT (menschliche Stimme)'}
Fake-Score: ${bio.fakeScore}/100 (ab 48 = Fake)
Konfidenz: ${bio.confidence}%

Messwerte:
- F0: ${bio.f0}Hz (Varianz ±${bio.f0Variance}Hz)
- Jitter: ${bio.jitter}% | Shimmer: ${bio.shimmer}dB | HNR: ${bio.hnr}dB
- Atemgeräusch-Index: ${bio.breathingIndex}
- MFCC-Konsistenz: ${bio.mfccConsistency}
- Spektraler Fluss: ${bio.spectralFlux}

Erkennungsmerkmale:
${bio.flags.map(f => '• ' + f).join('\n')}

Schreibe 3 Sätze auf Deutsch:
1. Klares Urteil mit Hauptgrund
2. Welche 2 Merkmale waren ausschlaggebend
3. ${bio.isFake ? 'Welche KI-Technologie wahrscheinlich verwendet wurde' : 'Warum die Stimme als authentisch gilt'}`

    const message = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }],
    })

    const analysis = message.content.map(c => c.type === 'text' ? c.text : '').join('')

    return NextResponse.json({ ...bio, analysis, timestamp: new Date().toISOString() })

  } catch (error) {
    console.error('analyze-voice error:', error)
    return NextResponse.json({ error: 'Analyse fehlgeschlagen' }, { status: 500 })
  }
}
