import { NextResponse } from 'next/server'

export async function GET() {
  const spaceUrl = (process.env.HF_SPACE_URL || '').replace(/\/$/, '')
  let spaceStatus = 'nicht konfiguriert'

  if (spaceUrl) {
    try {
      const res = await fetch(`${spaceUrl}/health`, { signal: AbortSignal.timeout(8000) })
      const data = await res.json()
      spaceStatus = res.ok ? `✓ Online — ${JSON.stringify(data)}` : `✗ ${res.status}`
    } catch (e) { spaceStatus = `✗ ${e}` }
  }

  return NextResponse.json({
    deployedVersion: 'v6-FastAPI',
    timestamp: new Date().toISOString(),
    env: {
      HF_SPACE_URL: spaceUrl || '✗ FEHLT',
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ? '✓' : '✗ FEHLT',
    },
    space: { url: spaceUrl, status: spaceStatus },
  })
}
