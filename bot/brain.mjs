// Bot brain: Groq + function calling (manual loop). Roman Urdu persona.
// v5 (Groq): Gemini hata diya — Groq (gpt-oss-120b) tez hai, aam tor par 1-2 sec jawab.
// 429/500/503 par auto-retry with backoff.
// v5.1: dealer-info fix — booking result mein asli office/phone, prompt mein sakht rule.
// v5.2: scope guard — bot SIRF property ki baat kare, bahar ke sawalon ka jawab na de.
// v5.3: MongoDB save (store.mjs) + dealer WhatsApp alert har lead/booking par.
import Groq from "groq-sdk";
import { listings } from "../data/listings.js";
import { dealer } from "../data/dealer.js";
import { saveLead, saveBooking } from "./store.mjs";
import { sendDealerAlert } from "./whatsapp.mjs";

// MODEL_NAME .env mein set kar sakte ho, warna default openai/gpt-oss-120b
// Tez/halka alternative: openai/gpt-oss-20b (dono free tier par same limits)
const MODEL = process.env.MODEL_NAME || "openai/gpt-oss-120b";
const MAX_STEPS = 6;

console.log("[bot] model:", MODEL);

// Client lazy banate hain taake bina key ke bhi server start ho jaye
// (/api/health kaam kare, /api/chat saaf error de — purana behavior).
let groq = null;
function getClient() {
  if (!groq) groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return groq;
}

// Temporary Groq-side errors (rate limit / server busy) par khud retry karo.
async function createWithRetry(args, tries = 3) {
  let delay = 1000;
  for (let i = 0; i < tries; i++) {
    try {
      return await getClient().chat.completions.create(args);
    } catch (e) {
      const status = e?.status || e?.statusCode;
      const msg = String(e?.message || e);
      const transient =
        status === 429 || status === 500 || status === 502 || status === 503 ||
        /429|rate limit|overloaded|503|500/i.test(msg);
      if (!transient || i === tries - 1) throw e;
      console.log(`[retry ${i + 1}/${tries}] Groq busy hai, ${delay / 1000}s wait...`);
      await new Promise((r) => setTimeout(r, delay));
      delay *= 2;
    }
  }
}

const SYSTEM = `Tum "${dealer.name}" ke WhatsApp assistant ho — DHA/Bahria Lahore ke property dealer ka 24/7 auto-reply bot.

RULES:
- Customer se ROMAN URDU mein baat karo. Dostana, izzat-dar lehja.
- WHATSAPP STYLE: har reply chhota rakho — 1 se 3 lines max. Lambi taqreer kabhi nahi.
- Pehle customer ki zaroorat samjho: khareedna hai ya bechna? budget kya hai? kaunsa area?
- Listing dikhate waqt: sirf 1-2 best options, priceText ke saath. Poori list ek saath mat bhejo.
- Jab customer interested lage: uska NAAM aur PHONE NUMBER lo, phir save_lead tool chalao.
- Site visit book karne ke liye: naam, phone, listing id, date, time lo, phir book_viewing chalao.
- Phone number mangte waqt ek baar politely pucho; zabardasti nahi.
- SCOPE (sakht rule): Tum SIRF property ki baat karte ho — ghar/plot khareedna ya bechna, listings, price, area, site visit, dealer office/timings. Property ke BAHAR ka koi sawal aaye (restaurants, cricket, general knowledge, dosri cheezein) to jawab MAT do — bas ye kaho: "Maazrat, main sirf Chaudhry Estate ki property mein madad kar sakta hoon. Ghar ya plot chahiye to batayein." Apni general knowledge se bahar ki cheezon ke naam/price kabhi mat batao.
- Listings ke bahar ki property bhi mat banao — sirf get_listings tool se mili listings batayo; jo listing hamare paas nahi, us ke baare mein jhoot mat bolo.
- Dealer ka address, phone ya timings batane se pehle get_dealer_info tool LAZMI chalao — bina tool chalaye kabhi address/phone mat likho, aur apne se number/address kabhi mat banao. Booking confirm karte waqt dealer ki jo contact info book_viewing ke result mein mile, WOHI likho.
- Agar customer English mein likhe to English mein jawab do, warna Roman Urdu.
- Tum AI ho ye chhupane ki zaroorat nahi, lekin baar baar "main AI hun" bhi mat kaho.`;

const tools = [
  {
    type: "function",
    function: {
      name: "get_listings",
      description: "Sample property listings nikalo. Filters optional hain.",
      parameters: {
        type: "object",
        properties: {
          area: { type: "string", description: "Area jese 'DHA Phase 5' ya 'Bahria'" },
          type: { type: "string", description: "'house' ya 'plot'" },
          budget_max: { type: "number", description: "Max budget in PKR, jese 30000000" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_dealer_info",
      description: "Dealer ka office address, phone, timings maloom karo.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "save_lead",
      description: "Interested customer ka naam aur phone save karo (lead capture).",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          phone: { type: "string" },
          budget: { type: "string" },
          area: { type: "string" },
          note: { type: "string" },
        },
        required: ["name", "phone"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "book_viewing",
      description: "Site visit book karo. Result mein dealer ki asli contact info (office/phone) bhi milti hai — confirmation mein WOHI likho, apne se kuch mat likho.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          phone: { type: "string" },
          listing_id: { type: "string", description: "jese L1" },
          date: { type: "string", description: "jese 'Saturday' ya '12 Nov'" },
          time: { type: "string", description: "jese '4pm'" },
        },
        required: ["name", "phone", "listing_id", "date", "time"],
      },
    },
  },
];

async function runTool(name, args) {
  if (name === "get_listings") {
    let out = listings;
    if (args.type) out = out.filter((l) => l.type === args.type);
    if (args.area) {
      const q = args.area.toLowerCase();
      out = out.filter((l) => l.area.toLowerCase().includes(q) || q.includes(l.area.toLowerCase().split(" ")[0]));
    }
    if (args.budget_max) out = out.filter((l) => l.price <= args.budget_max);
    return out.map((l) => ({
      id: l.id, type: l.type, area: l.area, size: l.size,
      price: l.priceText, beds: l.beds, desc: l.desc,
    }));
  }
  if (name === "get_dealer_info") return dealer;
  if (name === "save_lead") {
    const saved = await saveLead(args);
    try {
      await sendDealerAlert(`🔔 Nayi lead — ${dealer.name}\nNaam: ${saved.name}\nPhone: ${saved.phone}\nBudget: ${saved.budget || "-"}\nArea: ${saved.area || "-"}`);
      console.log("[bot] dealer alert bheji");
    } catch (e) { console.log("[bot] dealer alert fail:", e.message); }
    return { ok: true, saved };
  }
  if (name === "book_viewing") {
    const l = listings.find((x) => x.id === (args.listing_id || "").toUpperCase());
    if (!l) return { ok: false, error: "listing id nahi mili" };
    const booking = await saveBooking({ ...args, listing_id: l.id });
    try {
      await sendDealerAlert(`📅 Nayi booking — ${dealer.name}\nNaam: ${booking.name}\nPhone: ${booking.phone}\nListing: ${l.id} (${l.area}, ${l.size})\nDate: ${booking.date}, Time: ${booking.time}`);
      console.log("[bot] dealer alert bheji");
    } catch (e) { console.log("[bot] dealer alert fail:", e.message); }
    return { ok: true, booking, dealer: { office: dealer.office, phone: dealer.phone, timings: dealer.timings } };
  }
  return { ok: false, error: "unknown tool" };
}

// sessions: short-term memory per chat (OpenAI-style roles)
const sessions = new Map();

function trimHistory(history) {
  // purani baat-cheet lambi ho to tokens bachao: aakhri 6 turns (12 messages) rakho
  while (history.length > 12) history.splice(0, 2);
}

export async function chat(sessionId, userText) {
  if (!process.env.GROQ_API_KEY || process.env.GROQ_API_KEY === "PASTE_YOUR_KEY_HERE") {
    throw new Error("GROQ_API_KEY set nahi hai — .env file mein apni Groq key paste karo (console.groq.com se free milti hai).");
  }
  if (!sessions.has(sessionId)) sessions.set(sessionId, []);
  const history = sessions.get(sessionId);

  const messages = [
    { role: "system", content: SYSTEM },
    ...history,
    { role: "user", content: userText },
  ];

  for (let step = 0; step < MAX_STEPS; step++) {
    const res = await createWithRetry({
      model: MODEL,
      messages,
      tools,
      tool_choice: "auto",
    });
    const msg = res.choices?.[0]?.message;
    if (!msg) throw new Error("Groq se khaali jawab aaya.");
    const calls = msg.tool_calls || [];

    if (calls.length === 0) {
      const text = (msg.content || "").trim() || "...";
      history.push({ role: "user", content: userText });
      history.push({ role: "assistant", content: text });
      trimHistory(history);
      return text;
    }

    messages.push({ role: "assistant", content: msg.content || null, tool_calls: calls });
    for (const c of calls) {
      let args = {};
      try {
        args = JSON.parse(c.function.arguments || "{}");
      } catch {
        args = {};
      }
      const result = await runTool(c.function.name, args);
      messages.push({ role: "tool", tool_call_id: c.id, content: JSON.stringify(result) });
    }
  }
  return "Maazrat, kuch samajh nahi aaya — dobara batayein?";
}
