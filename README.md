# Sloth Digest

Paste a noisy group chat. Open-weight **Gemma**, served through the **Gemini API**, returns a two-line summary, what needs you, and what you can ignore.

Built for the DEV Hacktoberfest Open-Source AI Challenge, Week 3 (Slow and Steady).

## Run in VS Code
1. Install Node 18+ and open this folder in VS Code.
2. Get a free key at https://aistudio.google.com/apikey
3. In the VS Code terminal:
   ```bash
   npm install
   cp .env.example .env     # Windows: copy .env.example .env
   # edit .env and paste your GEMINI_API_KEY
   npm run dev
   ```
4. Open http://localhost:3000

Without a key the app runs in demo mode (sample chat only).

## Deploy to Render
1. Push this folder to a new GitHub repo.
2. In Render: New > Blueprint (it reads `render.yaml`), or New > Web Service with build `npm install` and start `npm start`.
3. Add the environment variable `GEMINI_API_KEY` in the Render dashboard.
4. Deploy. Health check path is `/api/health`.

## Notes
- The API key stays on the server. The browser only talks to `/api/*`.
- Models are set with `GEMINI_MODELS` (comma-separated). Check AI Studio for the Gemma model IDs currently available to your key.
- Gemma models on the Gemini API do not accept system instructions, so the rules live in the prompt (see `server.js`).
- Free Render services sleep when idle, so the first request can take about 30 seconds.
