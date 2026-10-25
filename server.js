import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.set("trust proxy", 1); // Render sits behind a proxy
app.use(express.json({ limit: "100kb" }));
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;
// AI_PROVIDER=ollama (local, VS Code) or gemini (deployed on Render)
const PROVIDER = (process.env.AI_PROVIDER || "ollama").toLowerCase();
const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "gemma3:4b";
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemma-4-31b-it";
const GEMINI_MODELS = (process.env.GEMINI_MODELS || "gemma-4-31b-it,gemma-4-26b-a4b-it")
  .split(",").map(s => s.trim()).filter(Boolean);
if (!GEMINI_MODELS.includes(GEMINI_MODEL)) GEMINI_MODELS.unshift(GEMINI_MODEL);

// Tiny in-memory rate limit: 10 requests per minute per IP
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter(t => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 10;
}

// One prompt for both providers (Gemma on the Gemini API accepts no system instruction)
const buildPrompt = chat => `You summarise chat logs for a busy person.
Reply with ONLY a JSON object, no markdown, in exactly this shape:
{"two_liner":"max two short sentences","needs_you":[{"who":"person or group","what":"concrete action with exact deadline"}],"ignore":["short phrase for noise"]}
Rules: needs_you has at most 5 items and each "what" starts with a verb. Keep deadlines exact. ignore has at most 4 items.

CHAT:
${chat}`;

function extractJson(text) {
  const clean = text.replace(/```json|```/gi, "");
  const a = clean.indexOf("{"), b = clean.lastIndexOf("}");
  if (a < 0 || b < 0) throw new Error("no json");
  const d = JSON.parse(clean.slice(a, b + 1));
  return {
    two_liner: String(d.two_liner || ""),
    needs_you: Array.isArray(d.needs_you) ? d.needs_you.slice(0, 5) : [],
    ignore: Array.isArray(d.ignore) ? d.ignore.slice(0, 4) : []
  };
}

async function ollamaModels() {
  try {
    const r = await fetch(`${OLLAMA_HOST}/api/tags`, { signal: AbortSignal.timeout(2000) });
    const d = await r.json();
    const names = (d.models || []).map(m => m.name);
    return names.sort((a, b) => /gemma/.test(b) - /gemma/.test(a));
  } catch { return []; }
}

async function listModels() {
  if (PROVIDER === "gemini") {
    return { configured: Boolean(GEMINI_KEY), models: GEMINI_MODELS, defaultModel: GEMINI_MODEL };
  }
  const models = await ollamaModels();
  const defaultModel = models.includes(OLLAMA_MODEL) ? OLLAMA_MODEL : (models[0] || OLLAMA_MODEL);
  return { configured: models.length > 0, models: models.length ? models : [OLLAMA_MODEL], defaultModel };
}

async function askOllama(model, prompt) {
  const r = await fetch(`${OLLAMA_HOST}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model, stream: false, format: "json", options: { temperature: 0.2 },
      messages: [{ role: "user", content: prompt }]
    })
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d?.error || "Ollama request failed");
  return d.message?.content || "";
}

async function askGemini(model, prompt) {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_KEY },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 900 }
      })
    }
  );
  const d = await r.json();
  if (!r.ok) throw new Error(d?.error?.message || "Gemini request failed");
  return (d.candidates?.[0]?.content?.parts || []).filter(p => !p.thought).map(p => p.text || "").join("");
}

app.get("/api/health", async (_req, res) => {
  res.json({ ok: true, provider: PROVIDER, ...(await listModels()) });
});

app.post("/api/digest", async (req, res) => {
  if (limited(req.ip)) return res.status(429).json({ error: "Slow down, sloth. Try again in a minute." });
  const info = await listModels();
  if (!info.configured) {
    return res.status(503).json({
      error: PROVIDER === "gemini"
        ? "Server has no GEMINI_API_KEY set."
        : `Ollama is not reachable at ${OLLAMA_HOST} or has no models. Run: ollama pull ${OLLAMA_MODEL}`
    });
  }
  const chat = String(req.body?.chat || "").trim().slice(0, 12000);
  if (!chat) return res.status(400).json({ error: "Paste some chat text first." });
  const model = info.models.includes(req.body?.model) ? req.body.model : info.defaultModel;

  const t0 = Date.now();
  try {
    const text = PROVIDER === "gemini"
      ? await askGemini(model, buildPrompt(chat))
      : await askOllama(model, buildPrompt(chat));
    const digest = extractJson(text);
    res.json({ ...digest, model, provider: PROVIDER, seconds: +((Date.now() - t0) / 1000).toFixed(1) });
  } catch (e) {
    console.error(e.message);
    res.status(502).json({ error: e.message === "no json" || e instanceof SyntaxError
      ? "The model answered in an unexpected format. Try again."
      : e.message });
  }
});

app.listen(PORT, () => console.log(`Sloth Digest on http://localhost:${PORT} using ${PROVIDER}`));
