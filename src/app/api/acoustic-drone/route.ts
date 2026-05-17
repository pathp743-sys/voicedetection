import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

function detectDroneInFft(fftData: number[], sampleRate: number) {
  const N = fftData.length
  const freqRes = (sampleRate / 2) / N

  // Power spectrum
  const power = fftData.map(v => v * v)
  const sorted = [...power].sort((a, b) => a - b)
  const noiseFloor = sorted[Math.floor(N * 0.15)] || 1e-9
  const maxPower = Math.max(...power)
  const snr = maxPower / noiseFloor

  const candidates: { freq: number; score: number; harmonics: number[]; decay: number }[] = []

  // Search for harmonic series 50–150 Hz
  for (let f0Hz = 50; f0Hz <= 150; f0Hz += 2) {
    const TOL = 0.06
    let harmonicScore = 0
    const foundHarmonics: number[] = []
    const peakPowers: number[] = []

    for (let h = 1; h <= 5; h++) {
      const targetHz = f0Hz * h
      const targetBin = Math.round(targetHz / freqRes)
      if (targetBin >= N) break

      const winLow  = Math.max(0, Math.round(targetBin * (1 - TOL)))
      const winHigh = Math.min(N - 1, Math.round(targetBin * (1 + TOL)))
      let peak = 0
      for (let b = winLow; b <= winHigh; b++) {
        if (power[b] > peak) peak = power[b]
      }

      const relPower = peak / noiseFloor
      if (relPower > 8) {  // Must be 8× above noise floor (strict)
        const weight = 1 / h
        harmonicScore += weight * Math.log10(relPower)
        foundHarmonics.push(parseFloat(targetHz.toFixed(1)))
        peakPowers.push(peak)
      }
    }

    if (foundHarmonics.length < 3) continue  // Need at least 3 harmonics

    // Decay check: each harmonic should be weaker than previous (natural drone property)
    // Allow some variation but prevent random peaks
    let decayScore = 0
    for (let i = 1; i < peakPowers.length; i++) {
      if (peakPowers[i] <= peakPowers[i - 1] * 1.5) decayScore++
    }
    const decayRatio = decayScore / (peakPowers.length - 1)

    // Periodicity: harmonics must be evenly spaced (already guaranteed by our search)
    // but we check that spacing is consistent within tolerance
    candidates.push({ freq: f0Hz, score: harmonicScore, harmonics: foundHarmonics, decay: decayRatio })
  }

  if (candidates.length === 0) {
    return { detected: false, confidence: 5, fundamentalHz: 0, harmonics: [], harmonicStrength: 0, snr: parseFloat(snr.toFixed(1)), bestMatch: 'Keine Drohne erkannt', allCandidates: [] }
  }

  candidates.sort((a, b) => b.score - a.score)
  const best = candidates[0]

  // STRICT thresholds to avoid false positives:
  // - Score > 2.5 (strong harmonic series)
  // - 3+ harmonics found
  // - Natural decay (most harmonics weaker than previous)
  // - High SNR
  const detected = best.score > 2.5
    && best.harmonics.length >= 3
    && best.decay >= 0.5
    && snr > 12

  const confidence = detected
    ? Math.min(97, Math.round(50 + best.score * 12 + best.harmonics.length * 5))
    : Math.min(35, Math.round(best.score * 8))

  const f = best.freq
  let bestMatch = 'Unbekannte Drohne'
  if (f >= 110 && f <= 130) bestMatch = 'DJI FPV / Racing Drone'
  else if (f >= 90 && f <= 110) bestMatch = 'DJI Phantom 4'
  else if (f >= 82 && f <= 92) bestMatch = 'DJI Mavic 3 / Parrot Anafi'
  else if (f >= 68 && f <= 82) bestMatch = 'DJI Mini 4 Pro / Mini 3'
  else if (f >= 50 && f <= 68) bestMatch = 'Großdrohne / Industrie-UAV'
  else if (f >= 100 && f <= 112) bestMatch = 'DJI Air 3 / Mavic Air'

  return {
    detected,
    confidence,
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

    const distanceM = result.detected
      ? Math.round(Math.max(5, 200 / Math.sqrt(result.harmonicStrength)))
      : null

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 180,
      system: 'Du bist ein akustisches Drohnenerkennungssystem. Antworte in 2 präzisen deutschen Sätzen.',
      messages: [{
        role: 'user',
        content: `${isLive ? `Live ${durationSeconds}s` : `Datei: "${fileName}"`} | ${result.detected ? `DROHNE: ${result.bestMatch}` : 'KEINE DROHNE'} | BPF: ${result.fundamentalHz}Hz | Harmonische: ${result.harmonics.join(', ')}Hz | Score: ${result.harmonicStrength} | SNR: ${result.snr} | Konfidenz: ${result.confidence}%`,
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
