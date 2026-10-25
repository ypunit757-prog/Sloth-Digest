# Sloth Digest

Paste a noisy group chat. Open-weight **Gemma** returns a two-line summary, what needs you, and what you can ignore.

- **Local (VS Code):** runs Gemma through **Ollama**. Fully offline, nothing leaves your machine.
- **Deployed (Render):** runs Gemma through the **Gemini API**.

Switch with one variable: `AI_PROVIDER=ollama` or `AI_PROVIDER=gemini`.

## Run locally with Ollama
1. Install Node 18+ and [Ollama](https://ollama.com).
2. `ollama pull gemma3:4b`  (Ollama runs in the background after install.)
3. In the VS Code terminal:
   ```bash
   npm install
   cp .env.example .env     # Windows: copy .env.example .env
   npm run dev
   ```
4. Open http://localhost:3000. The status pill should read "Ready: gemma3:4b via Ollama on your machine".

## Deploy to Render with the Gemini API
1. Push this folder to a new GitHub repo (`.env` is git-ignored).
2. Get a key at https://aistudio.google.com/apikey
3. In Render: New > Blueprint (reads `render.yaml`).
4. Add `GEMINI_API_KEY` in the Render dashboard, then deploy. `render.yaml` already sets `AI_PROVIDER=gemini`.

## Notes
- The browser only talks to `/api/*`; keys and Ollama calls stay on the server.
- Check AI Studio for the Gemma model IDs your key can use; edit `GEMINI_MODELS` if they differ.
- Free Render services sleep when idle; the first request can take about 30 seconds.
