import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

/*
  Drone acoustic fingerprints — from peer-reviewed literature:
  
  Real drone BPF (Blade Pass Frequency) = RPM/60 × num_blades
  DJI Phantom 4:  ~93–96 Hz  (2 blades, ~2800 RPM per motor)
  DJI Mavic 3:    ~85–90 Hz
  DJI Mini 4 Pro: ~70–78 Hz  (lightweight, slower RPM)
  DJI FPV:        ~110–125 Hz (high-speed racing)
  Parrot Anafi:   ~87–93 Hz
  Generic drone:  50–130 Hz fundamental + harmonics at 2×, 3×, 4×
  
  Key insight: drones produce PERIODIC harmonic series
  A real drone has energy at: f₀, 2f₀, 3f₀, 4f₀ (very consistent)
  Random noise does NOT have this pattern.
*/

interface FFTBin { freq: number; power: number }

function detectDroneInFft(
  fftData: number[],
  sampleRate: number
): {
  detected: boolean
  confidence: number
  fundamentalHz: number
  harmonics: number[]
  harmonicStrength: number
  snr: number
  bestMatch: string
  allCandidates: { freq: number; score: number; harmonics: number[] }[]
} {
  const N = fftData.length
  const freqRes = sampleRate / 2 / N  // Hz per bin

  // Convert to power (square of magnitude)
  const power = fftData.map(v => v * v)

  // Noise floor = 10th percentile of all bins
  const sorted = [...power].sort((a, b) => a - b)
  const noiseFloor = sorted[Math.floor(N * 0.1)] || 1e-6
  const maxPower = Math.max(...power)
  const snr = maxPower / noiseFloor

  // Search for harmonic series in drone frequency range (50–150 Hz)
  // Try each possible fundamental frequency
  const candidates: { freq: number; score: number; harmonics: number[] }[] = []

  for (let f0Hz = 50; f0Hz <= 150; f0Hz += 1) {
    const f0Bin = Math.round(f0Hz / freqRes)
    if (f0Bin >= N) continue

    // Check up to 5 harmonics
    let harmonicScore = 0
    const foundHarmonics: number[] = []
    let harmonicsFound = 0
    const TOL = 0.07 // 7% frequency tolerance

    for (let h = 1; h <= 5; h++) {
      const targetHz = f0Hz * h
      const targetBin = Math.round(targetHz / freqRes)
      if (targetBin >= N) break

      // Search in tolerance window
      const winLow  = Math.round(targetBin * (1 - TOL))
      const winHigh = Math.round(targetBin * (1 + TOL))
      let peakPower = 0
      for (let b = Math.max(0, winLow); b <= Math.min(N-1, winHigh); b++) {
        if (power[b] > peakPower) peakPower = power[b]
      }

      const relPower = peakPower / noiseFloor
      // Higher harmonics decay — weight accordingly
      const weight = 1 / h
      if (relPower > 3) {  // 3× above noise floor = significant peak
        harmonicScore += weight * Math.log10(relPower)
        foundHarmonics.push(parseFloat(targetHz.toFixed(1)))
        harmonicsFound++
      }
    }

    // Require at least 2 harmonics to be a valid candidate
    if (harmonicsFound >= 2) {
      candidates.push({ freq: f0Hz, score: harmonicScore, harmonics: foundHarmonics })
    }
  }

  if (candidates.length === 0) {
    return {
      detected: false, confidence: 5, fundamentalHz: 0,
      harmonics: [], harmonicStrength: 0, snr,
      bestMatch: 'Keine Drohne erkannt',
      allCandidates: [],
    }
  }

  // Best candidate = highest harmonic score
  candidates.sort((a, b) => b.score - a.score)
  const best = candidates[0]

  // Confidence based on:
  // 1. Harmonic score strength
  // 2. Number of harmonics found
  // 3. SNR
  const harmonicsFound = best.harmonics.length
  const rawConf = Math.min(
    99,
    Math.round(
      best.score * 18 +
      harmonicsFound * 12 +
      Math.min(20, Math.log10(snr + 1) * 10)
    )
  )

  // Detection threshold: need score > 0.8 AND at least 2 harmonics
  const detected = best.score > 0.8 && harmonicsFound >= 2

  // Match to known drone models
  const f = best.freq
  let bestMatch = 'Unbekannte Drohne'
  if (f >= 110 && f <= 128) bestMatch = 'DJI FPV / Racing Drone'
  else if (f >= 90 && f <= 100) bestMatch = 'DJI Phantom 4 / Phantom 3'
  else if (f >= 83 && f <= 93) bestMatch = 'DJI Mavic 3 / Parrot Anafi'
  else if (f >= 68 && f <= 82) bestMatch = 'DJI Mini 4 Pro / Mini 3'
  else if (f >= 50 && f <= 67) bestMatch = 'Großdrohne / Schwerer UAV'
  else if (f >= 100 && f <= 110) bestMatch = 'DJI Air 3 / Mavic Air'

  return {
    detected,
    confidence: detected ? Math.max(55, rawConf) : Math.min(40, rawConf),
    fundamentalHz: best.freq,
    harmonics: best.harmonics,
    harmonicStrength: parseFloat(best.score.toFixed(3)),
    snr: parseFloat(snr.toFixed(1)),
    bestMatch,
    allCandidates: candidates.slice(0, 5),
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { fftData, sampleRate = 44100, isLive, fileName, durationSeconds } = body

    if (!fftData || !Array.isArray(fftData) || fftData.length < 64) {
      return NextResponse.json({ error: 'Keine gültigen FFT-Daten' }, { status: 400 })
    }

    const result = detectDroneInFft(fftData, sampleRate)

    // Estimate distance from signal level (rough estimate)
    const distanceM = result.detected
      ? Math.round(Math.max(5, 300 / Math.sqrt(result.harmonicStrength + 0.1)))
      : null

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 200,
      system: 'Du bist ein akustisches Drohnenerkennungssystem. Antworte in 2 präzisen deutschen Sätzen. Kein Disclaimer.',
      messages: [{
        role: 'user',
        content: `${isLive ? `Live-Aufnahme: ${durationSeconds}s` : `Datei: "${fileName}"`}
Ergebnis: ${result.detected ? `DROHNE ERKANNT — ${result.bestMatch}` : 'KEINE DROHNE'}
Grundfrequenz: ${result.fundamentalHz}Hz | Harmonische: ${result.harmonics.join(', ')}Hz
Harmonik-Score: ${result.harmonicStrength} | SNR: ${result.snr} | Konfidenz: ${result.confidence}%
Erkläre das Ergebnis in 2 Sätzen.`
      }],
    })

    const explanation = message.content.map(c => c.type === 'text' ? c.text : '').join('').trim()

    return NextResponse.json({
      detected: result.detected,
      confidence: result.confidence,
      fundamentalHz: result.fundamentalHz,
      harmonics: result.harmonics,
      harmonicStrength: result.harmonicStrength,
      snr: result.snr,
      model: result.bestMatch,
      distance: distanceM,
      allCandidates: result.allCandidates,
      analysis: explanation,
      isLive,
      fileName: fileName || null,
      timestamp: new Date().toISOString(),
    })

  } catch (err) {
    console.error('drone error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
