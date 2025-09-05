
# Security Co-Pilot (POC)

Split-screen web app:
- **Left:** JSON-driven list of security issues (each with links).
- **Right:** Co-pilot that reads those links, then generates a step-by-step remediation guide.

## Prereqs
- macOS
- Node.js LTS (https://nodejs.org) — includes npm

## 1) Backend (server)
```bash
cd server
cp .env.example .env
# Edit .env and paste your OpenAI API key
npm i
npm run dev
# -> Server listening on http://localhost:5050
```

## 2) Frontend (app)
```bash
cd ../app
npm i
npm run dev
# Open the printed URL (usually http://localhost:5173)
```

## 3) Try it
- Pick an issue on the left
- Click **Guide me** on the right
- The server scrapes the links and asks the model to produce a guide

## 4) Customize issues
Edit `app/src/issues.json` to add your own issues and links.

## 5) Production-like preview
```bash
cd app
npm run build
npm run preview
```

## Notes
- Scraping is done server-side to avoid CORS and keep your API key secret.
- For demos over the internet, expose the server with ngrok and change the `BASE` in `app/src/lib/api.ts`.
