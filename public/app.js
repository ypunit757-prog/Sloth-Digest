const $ = id => document.getElementById(id);
let configured = false;

const SAMPLE = `Priya: ok so who's booking the Rishikesh homestay??
Arjun: lol not me, I'm still stuck on the DBMS assignment
Neha: assignment is due Friday 5pm btw, Prof said no extensions
Rahul: 😂😂😂 sticker
Priya: seriously someone book it before Sunday, prices go up after
Arjun: Neha can you share your ER diagram notes
Neha: sent in the drive folder
Rahul: who's bringing the speaker?
Karan: I can bring the speaker. Also I need ₹1,800 from everyone for the cab, pls pay by Saturday
Rahul: good morning everyone ☀️
Priya: @Arjun you still haven't sent your ID for the booking
Neha: also library fine notice came for Arjun lol
Arjun: ugh ok sending ID now
Rahul: anyone watching the match tonight`;

const DEMO = {
  two_liner: "The Rishikesh trip needs a homestay booked before Sunday. The DBMS assignment is due Friday 5pm with no extensions.",
  needs_you: [
    { who: "Someone in the group", what: "Book the homestay before Sunday, when prices go up." },
    { who: "Arjun", what: "Send your ID to Priya for the booking." },
    { who: "Everyone", what: "Pay Karan ₹1,800 for the cab by Saturday." },
    { who: "Arjun", what: "Finish the DBMS assignment by Friday 5pm." }
  ],
  ignore: ["Good-morning messages and stickers", "Tonight's match chatter", "Library fine joke"]
};

const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function setStatus(ok, msg) {
  $("status").className = "status" + (ok ? " ok" : "");
  $("statusText").textContent = msg;
}

async function init() {
  try {
    const r = await fetch("/api/health");
    const h = await r.json();
    configured = h.configured;
    $("model").innerHTML = "";
    h.models.forEach(m => $("model").add(new Option(m, m, false, m === h.defaultModel)));
    setStatus(configured, configured ? "Ready with " + h.defaultModel : "No API key on the server. Demo mode is on.");
  } catch {
    $("model").add(new Option("gemma-3-27b-it", "gemma-3-27b-it"));
    setStatus(false, "Server not reachable. Demo mode is on.");
  }
}

function render(d, words, demo) {
  const need = (d.needs_you || []).map(n =>
    `<li><strong>${esc(n.who || "You")}</strong>${esc(n.what || "")}</li>`).join("") || "<li>Nothing needs you. Enjoy that.</li>";
  const skip = (d.ignore || []).map(s => `<li>${esc(s)}</li>`).join("");
  const mins = Math.max(0.5, Math.round(words / 200 * 10) / 10);
  const src = demo ? "Demo result (no API key on the server)" : `Written by ${esc(d.model)} in ${d.seconds}s`;
  $("out").innerHTML = `
    <p class="eyebrow">${src}</p>
    <p class="two">${esc(d.two_liner)}</p>
    <div class="block"><h3>Actually needs you</h3><ul class="need">${need}</ul></div>
    ${skip ? `<div class="block"><h3>Safe to ignore</h3><ul class="skip">${skip}</ul></div>` : ""}
    <div class="saved"><span>You skipped reading ${words} words</span><big>≈ ${mins} min saved</big></div>
    <div class="row"><button class="btn" id="copy">Copy digest</button></div>`;
  $("copy").onclick = async e => {
    const t = [d.two_liner, "", ...(d.needs_you || []).map(n => `• ${n.who}: ${n.what}`)].join("\n");
    try { await navigator.clipboard.writeText(t); e.target.textContent = "Copied"; }
    catch { e.target.textContent = "Copy failed. Select the text instead."; }
  };
}

function showError(msg) { $("out").innerHTML = `<div class="err">${msg}</div>`; }

async function summarise() {
  const text = $("chat").value.trim();
  $("empty").style.display = "none";
  if (!text) return showError("Paste some chat text first.");
  const words = text.split(/\s+/).length;
  $("out").innerHTML = "";
  $("slow").classList.add("on");
  $("go").disabled = true;
  try {
    if (!configured) {
      await new Promise(r => setTimeout(r, 1200));
      if (text !== SAMPLE) return showError("<b>Demo mode only knows the sample chat.</b><br>Add GEMINI_API_KEY on the server to summarise your own text.");
      return render(DEMO, words, true);
    }
    const r = await fetch("/api/digest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat: text, model: $("model").value })
    });
    const d = await r.json();
    if (!r.ok) return showError(`<b>Could not summarise.</b><br>${esc(d.error || "Unknown error")}`);
    render(d, words, false);
  } catch {
    showError("<b>Could not reach the server.</b><br>Check that it is running and try again.");
  } finally {
    $("slow").classList.remove("on");
    $("go").disabled = false;
  }
}

$("go").onclick = summarise;
$("sample").onclick = () => { $("chat").value = SAMPLE; $("chat").focus(); };
init();
