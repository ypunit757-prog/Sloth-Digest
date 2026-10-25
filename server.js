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
const KEY = process.env.GEMINI_API_KEY;
const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemma-3-27b-it";
const MODELS = (process.env.GEMINI_MODELS || "gemma-3-27b-it,gemma-3-12b-it,gemma-3-4b-it")
  .split(",").map(s => s.trim()).filter(Boolean);
if (!MODELS.includes(DEFAULT_MODEL)) MODELS.unshift(DEFAULT_MODEL);

// Tiny in-memory rate limit: 10 requests per minute per IP
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter(t => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 10;
}

// Gemma models on the Gemini API take no system instruction, so the rules go in the prompt.
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

app.get("/api/health", (_req, res) =>
  res.json({ ok: true, configured: Boolean(KEY), models: MODELS, defaultModel: DEFAULT_MODEL }));

app.post("/api/digest", async (req, res) => {
  if (!KEY) return res.status(503).json({ error: "Server has no GEMINI_API_KEY set." });
  if (limited(req.ip)) return res.status(429).json({ error: "Slow down, sloth. Try again in a minute." });

  const chat = String(req.body?.chat || "").trim().slice(0, 12000);
  const model = MODELS.includes(req.body?.model) ? req.body.model : DEFAULT_MODEL;
  if (!chat) return res.status(400).json({ error: "Paste some chat text first." });

  const t0 = Date.now();
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": KEY },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: buildPrompt(chat) }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 900 }
        })
      }
    );
    const data = await r.json();
    if (!r.ok) {
      console.error("Gemini error:", data?.error?.message);
      return res.status(502).json({ error: data?.error?.message || "The model request failed." });
    }
    const text = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("");
    const digest = extractJson(text);
    res.json({ ...digest, model, seconds: +((Date.now() - t0) / 1000).toFixed(1) });
  } catch (e) {
    console.error(e);
    res.status(502).json({ error: "The model answered in an unexpected format. Try again." });
  }
});

app.listen(PORT, () => console.log(`Sloth Digest running on http://localhost:${PORT}`));
