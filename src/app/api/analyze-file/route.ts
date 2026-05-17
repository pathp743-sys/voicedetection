import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const SPACE_URL = (process.env.HF_SPACE_URL || '').replace(/\/$/, '')

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'Keine Datei' }, { status: 400 })

    if (!SPACE_URL) {
      return NextResponse.json({
        error: 'HF_SPACE_URL nicht gesetzt',
        hint: 'Vercel → Settings → Environment Variables → HF_SPACE_URL = https://DEIN-NAME-voicesense-deepfake-api.hf.space',
      }, { status: 503 })
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || 'wav'
    const fileSizeKB = (file.size / 1024).toFixed(1)
    const arrayBuffer = await file.arrayBuffer()

    // Send to HF Space FastAPI /detect endpoint
    const fd = new FormData()
    fd.append('file', new Blob([arrayBuffer], { type: file.type || 'audio/wav' }), file.name)

    const res = await fetch(`${SPACE_URL}/detect`, {
      method: 'POST',
      body: fd,
      signal: AbortSignal.timeout(120000),
    })

    if (!res.ok) {
      const txt = await res.text()
      return NextResponse.json({
        error: `Space Fehler ${res.status}`,
        detail: txt.slice(0, 300),
      }, { status: 502 })
    }

    const result = await res.json()
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    const { isFake, confidence, fakeScore, realScore } = result

    const message = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 150,
      system: 'Stimmforensik-Experte. Genau 2 deutsche Sätze. Kein Disclaimer.',
      messages: [{
        role: 'user',
        content: `DF_Arena_1B_V_1: Spoof ${fakeScore}% / Bonafide ${realScore}% → ${isFake ? 'FAKE' : 'ECHT'} (${confidence}%). Datei: ${fileSizeKB}KB .${ext}. 2 Sätze Erklärung.`,
      }],
    })

    const analysis = message.content.map(c => c.type === 'text' ? c.text : '').join('').trim()

    return NextResponse.json({
      isFake,
      confidence,
      fakeScore,
      realScore,
      modelUsed: 'DF_Arena_1B_V_1',
      analysis,
      fileSize: fileSizeKB + ' KB',
      timestamp: new Date().toISOString(),
    })

  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
