import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

function detectDrone(fftData: number[], sampleRate: number) {
  const N = fftData.length
  const freqRes = (sampleRate / 2) / N

  // --- Debug stats ---
  const maxVal = Math.max(...fftData)
  const minVal = Math.min(...fftData)
  const meanVal = fftData.reduce((a, b) => a + b, 0) / N
  const sorted = [...fftData].sort((a, b) => a - b)
  const p50 = sorted[Math.floor(N * 0.50)]  // median
  const p90 = sorted[Math.floor(N * 0.90)]  // 90th percentile
  const p99 = sorted[Math.floor(N * 0.99)]  // 99th percentile

  // True noise floor = median (not easily dominated by peaks)
  const noiseFloor = p50

  // A peak is significant only if it's WAY above the 90th percentile
  // For drone detection we need peaks that stand out from the crowd
  const peakThreshold = p90 + (p99 - p90) * 2  // well above 90th percentile

  // Find all significant peaks in 50-200 Hz range
  const droneZoneLow  = Math.round(50  / freqRes)
  const droneZoneHigh = Math.round(200 / freqRes)

  const peaks: { bin: number; freq: number; val: number }[] = []
  for (let i = Math.max(1, droneZoneLow); i < Math.min(droneZoneHigh, N - 1); i++) {
    if (fftData[i] > fftData[i-1] && fftData[i] > fftData[i+1] && fftData[i] > peakThreshold) {
      peaks.push({ bin: i, freq: parseFloat((i * freqRes).toFixed(1)), val: fftData[i] })
    }
  }

  // Sort by strength
  peaks.sort((a, b) => b.val - a.val)
  const topPeaks = peaks.slice(0, 10)

  // For each strong peak, check if it has harmonics
  const candidates: { f0: number; score: number; harmonics: number[]; matchCount: number }[] = []

  for (const peak of topPeaks.slice(0, 5)) {
    const f0 = peak.freq
    const harmonicsFound: number[] = [f0]
    let score = (peak.val - noiseFloor) / (p99 - noiseFloor + 1e-9)
    let matchCount = 1

    for (let h = 2; h <= 5; h++) {
      const targetHz = f0 * h
      const targetBin = Math.round(targetHz / freqRes)
      if (targetBin >= N) break

      // Search ±5% around expected harmonic
      const TOL = Math.round(targetBin * 0.05)
      let bestVal = 0
      let bestHz = 0
      for (let b = Math.max(0, targetBin - TOL); b <= Math.min(N-1, targetBin + TOL); b++) {
        if (fftData[b] > bestVal) { bestVal = fftData[b]; bestHz = b * freqRes }
      }

      // Harmonic counts only if it's above the 90th percentile
      if (bestVal > p90) {
        harmonicsFound.push(parseFloat(bestHz.toFixed(1)))
        score += (bestVal - noiseFloor) / (p99 - noiseFloor + 1e-9) / h
        matchCount++
      }
    }

    if (matchCount >= 3) {
      candidates.push({ f0, score, harmonics: harmonicsFound, matchCount })
    }
  }

  candidates.sort((a, b) => b.score - a.score)
  const best = candidates[0]

  // Detection requires:
  // 1. At least one strong peak exists in drone zone
  // 2. At least 3 harmonics confirmed
  // 3. The harmonic score is strong relative to the audio content
  // 4. p99/p50 ratio is high (audio has sharp peaks, not flat noise)
  const dynamicRange = p99 / (p50 + 1e-9)

  const detected = best !== undefined
    && best.matchCount >= 3
    && best.score > 1.5
    && dynamicRange > 3   // Audio must have clear peaks above noise

  const confidence = detected
    ? Math.min(96, Math.round(55 + best.score * 15 + best.matchCount * 5))
    : 0

  const f = best?.f0 ?? 0
  let modelName = 'Unbekannte Drohne'
  if (f >= 110) modelName = 'DJI FPV / Racing'
  else if (f >= 90) modelName = 'DJI Phantom 4'
  else if (f >= 82) modelName = 'DJI Mavic 3'
  else if (f >= 68) modelName = 'DJI Mini'
  else if (f >= 50) modelName = 'Industrie-UAV'

  return {
    detected,
    confidence,
    fundamentalHz: best?.f0 ?? 0,
    harmonics: best?.harmonics ?? [],
    harmonicStrength: parseFloat((best?.score ?? 0).toFixed(3)),
    matchCount: best?.matchCount ?? 0,
    snr: parseFloat((dynamicRange).toFixed(1)),
    peakCount: topPeaks.length,
    bestMatch: detected ? modelName : 'Keine Drohne',
    allCandidates: candidates.slice(0, 3),
    // Debug info
    debug: { maxVal: maxVal.toFixed(4), p50: p50.toFixed(4), p90: p90.toFixed(4), p99: p99.toFixed(4), peakThreshold: peakThreshold.toFixed(4), dynamicRange: dynamicRange.toFixed(2), peaksInDroneZone: topPeaks.length }
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { fftData, sampleRate = 44100, isLive, fileName, durationSeconds } = body

    if (!fftData || !Array.isArray(fftData) || fftData.length < 64) {
      return NextResponse.json({ error: 'Keine FFT-Daten' }, { status: 400 })
    }

    const result = detectDrone(fftData, sampleRate)

    let explanation = ''
    if (result.detected) {
      const msg = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 150,
        system: 'Akustisches Drohnenerkennungssystem. 2 deutsche Sätze.',
        messages: [{ role: 'user', content: `DROHNE ERKANNT: ${result.bestMatch} | BPF: ${result.fundamentalHz}Hz | ${result.matchCount} Harmonische | Score: ${result.harmonicStrength}` }],
      })
      explanation = msg.content.map(c => c.type === 'text' ? c.text : '').join('').trim()
    }

    return NextResponse.json({
      detected: result.detected,
      confidence: result.confidence,
      fundamentalHz: result.fundamentalHz,
      harmonics: result.harmonics,
      harmonicStrength: result.harmonicStrength,
      snr: result.snr,
      model: result.bestMatch,
      distance: result.detected ? Math.round(150 / Math.sqrt(result.harmonicStrength + 0.1)) : null,
      allCandidates: result.allCandidates,
      analysis: explanation,
      debug: result.debug,
      isLive,
      fileName: fileName || null,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
