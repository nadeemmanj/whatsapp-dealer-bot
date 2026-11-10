# WhatsApp Dealer Bot — DEMO (test version)

Ye **demo** hai — asli WhatsApp se connected NAHI. Is mein tum bot ko browser mein
WhatsApp-jaisi chat mein test kar sakte ho, bilkul wese jese dealer ka customer karega.

## Chalane ka tareeqa (apne PC par)

1. Is folder mein terminal/PowerShell kholo
2. `npm install`
3. `.env.example` ko copy karke `.env` banao, aur us mein apni **GEMINI_API_KEY** paste karo
   (wahi key jo AI-agent Phase 1 mein banayi thi)
4. `npm start`
5. Browser mein kholo: **http://localhost:3000**

## Test karne ke liye sample messages

- `Assalam o Alaikum, mujhe DHA mein ghar chahiye`
- `Mera budget 3 crore hai, 5 marla ghar dikhao`
- `Bahria mein plot hai koi?`
- `Office kahan hai aur timing kya hai?`
- `Mera naam Ahmed hai, number 0301-1112223, L1 wali visit Saturday 4pm book kar do`

## Bot kya karta hai (tools)

- `get_listings` — area / type / budget ke hisaab se sample listings nikalta hai
- `get_dealer_info` — office address, phone, timings
- `save_lead` — naam + phone save karta hai → `leads.json` file mein
- `book_viewing` — site visit book karta hai → `leads.json` mein

`leads.json` kholo — wahan dekho kaunse leads/bookings save hui. Yahi wo data hai
jo real system mein dealer ko milega.

## Asli WhatsApp se connect karna (baad ka step)

Is demo ke baad asli WhatsApp connection ke liye chahiye:
1. Meta Developer account + WhatsApp Cloud API setup (free)
2. Webhook URL (server ko public karna hoga)
3. Isi brain ko webhook se jorna

Ye step tab karenge jab demo pasand aa jaye aur pehla dealer ready ho.

## Files

- `server.mjs` — Express server
- `bot/brain.mjs` — Gemini function-calling loop (Roman Urdu persona)
- `bot/store.mjs` — leads/bookings save
- `data/listings.js` — SAMPLE listings (fictional)
- `data/dealer.js` — SAMPLE dealer info (fictional)
- `public/index.html` — WhatsApp-style chat UI
