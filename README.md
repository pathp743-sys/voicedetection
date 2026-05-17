# VoiceSense Pro

KI-Plattform für Stimmerkennung (Fake vs. Echt), Sprecheridentifikation und Drohnenüberwachung.
Powered by **Claude Sonnet 4** (Anthropic).

## Features

- 🎙️ **Stimmerkennung** — Deepfake/TTS vs. echte Stimme mit Spektralanalyse
- 👤 **Sprechererkennung** — Biometrische Personenidentifikation (Umur, Thomas, etc.)
- 🚁 **Drohnenerkennung** — Echtzeit-Radarüberwachung mit KI-Lageeinschätzung
- 📊 **Dashboard** — Statistiken, Ereignisprotokoll, Modellgenauigkeit

## Schnellstart (lokal)

```bash
# 1. Dependencies installieren
npm install

# 2. Umgebungsvariablen setzen
cp .env.example .env.local
# Dann ANTHROPIC_API_KEY in .env.local eintragen

# 3. Entwicklungsserver starten
npm run dev
# → http://localhost:3000
```

## Deployment auf Vercel

### Option A — GitHub + Vercel (empfohlen)

1. **GitHub Repo erstellen:**
   ```bash
   git init
   git add .
   git commit -m "initial commit"
   git remote add origin https://github.com/DEIN-USERNAME/voicesense-pro.git
   git push -u origin main
   ```

2. **Vercel verbinden:**
   - Gehe zu [vercel.com](https://vercel.com) → "New Project"
   - Importiere dein GitHub-Repo
   - Framework: **Next.js** (automatisch erkannt)
   - Klicke "Deploy"

3. **API-Key hinzufügen:**
   - Vercel Dashboard → Dein Projekt → Settings → Environment Variables
   - Name: `ANTHROPIC_API_KEY`
   - Value: dein Key von [console.anthropic.com](https://console.anthropic.com)
   - Klicke "Save" → dann **Redeploy**

### Option B — Vercel CLI

```bash
npm i -g vercel
vercel login
vercel --prod
# API-Key in Vercel Dashboard hinzufügen (siehe Schritt 3 oben)
```

## API-Key holen

1. Gehe zu [console.anthropic.com](https://console.anthropic.com)
2. API Keys → Create Key
3. Key kopieren und in Vercel Environment Variables einfügen

## Tech Stack

| Komponente | Technologie |
|-----------|-------------|
| Framework | Next.js 14 (App Router) |
| Styling | Tailwind CSS |
| KI-Backend | Claude Sonnet 4 via Anthropic SDK |
| Icons | Lucide React |
| Deployment | Vercel |

## Projektstruktur

```
voicesense-pro/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── analyze-voice/route.ts    ← Stimm-API
│   │   │   ├── identify-speaker/route.ts ← Sprecher-API
│   │   │   └── analyze-drone/route.ts    ← Drohnen-API
│   │   ├── voice/page.tsx
│   │   ├── speaker/page.tsx
│   │   ├── drone/page.tsx
│   │   ├── dashboard/page.tsx
│   │   ├── globals.css
│   │   └── layout.tsx
│   └── components/
│       ├── Sidebar.tsx
│       └── AppLayout.tsx
├── .env.example
├── next.config.js
├── tailwind.config.js
└── package.json
```

## Sprecher hinzufügen

Auf der Seite "Sprechererkennung" kannst du eigene Namen eingeben und zur Datenbank hinzufügen.

---

Made with Claude Sonnet 4 · Anthropic
