import "dotenv/config";
import {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
} from "@whiskeysockets/baileys";
import P from "pino";
import cron from "node-cron";
import fetch from "node-fetch";
import moment from "moment-timezone";
import qrcode from "qrcode-terminal";

const GROUP_ID = "120363420780867020@g.us";

let sock;

// ========== FETCH FUNCTIONS ========== //
async function fetchGoldSilver() {
  try {
    const res = await fetch("https://data-asg.goldprice.org/dbXRates/USD", {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) throw new Error("Failed to fetch gold/silver");
    const data = await res.json();
    return data.items[0];
  } catch (e) {
    console.error("Error fetching gold/silver:", e);
    return null;
  }
}

async function fetchCrypto() {
  try {
    const urls = [
      "https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT",
      "https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT",
      "https://api.binance.com/api/v3/ticker/price?symbol=XRPUSDT",
    ];
    const results = await Promise.all(urls.map(url => fetch(url)));
    const [btc, eth, xrp] = await Promise.all(results.map(res => res.json()));

    return {
      bitcoin: { usd: parseFloat(btc.price) },
      ethereum: { usd: parseFloat(eth.price) },
      ripple: { usd: parseFloat(xrp.price) },
    };
  } catch (e) {
    console.error("Error fetching crypto:", e);
    return null;
  }
}

async function fetchForex() {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD");
    if (!res.ok) throw new Error("Failed to fetch forex");
    const data = await res.json();
    return { rates: data.rates || {} };
  } catch (e) {
    console.error("Error fetching forex:", e);
    return null;
  }
}

// ========== CALCULATIONS & FORMAT ========== //
function calculateGoldPrices(goldOunce, silverOunce) {
  const goldGram = goldOunce / 31.1;
  const silverGram = silverOunce / 31.1;

  return {
    "Msqal 21K": goldGram * 0.875 * 5,
    "Msqal 18K": goldGram * 0.75 * 5,
    "Dubai Lira 7.2g": goldGram * 0.916 * 7.2,
    "250g 995": goldGram * 0.995 * 250,
    "500g 995": goldGram * 0.995 * 500,
    "1Kg 995": goldGram * 0.995 * 1000,
    "Silver 1Kg": silverGram * 1000,
  };
}

function formatMessage(prices, crypto, forex) {
  const now = moment().tz("Etc/GMT-3").format("DD MMMM YYYY | hh:mm A");

  return `📅 ${now} (GMT+3)
—————————————
Gold Ounce: $${prices.goldOunce.toFixed(2)}
Silver Ounce: $${prices.silverOunce.toFixed(2)}
Bitcoin: $${crypto.bitcoin?.usd?.toLocaleString() || "N/A"}
Ethereum: $${crypto.ethereum?.usd?.toLocaleString() || "N/A"}
XRP: $${crypto.ripple?.usd?.toFixed(4) || "N/A"}
—————————————
Gold:
Msqal 21K = $${prices.calculated["Msqal 21K"].toFixed(2)}
Msqal 18K = $${prices.calculated["Msqal 18K"].toFixed(2)}
Dubai Lira 7.2g = $${prices.calculated["Dubai Lira 7.2g"].toFixed(2)}
—————————————
Silver:
1Kg = $${prices.calculated["Silver 1Kg"].toFixed(2)}
—————————————
Forex:
100 EUR = $${(100 / (forex.rates.EUR || 1)).toFixed(2)}
100 GBP = $${(100 / (forex.rates.GBP || 1)).toFixed(2)}
`;
}

// ========== WHATSAPP SETUP ========== //
async function startSock() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info_multi");
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    logger: P({ level: "info" }),
    printQRInTerminal: false,
  });

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log("🔍 Scan this QR code with WhatsApp:");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "close") {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log(`Connection closed, ${shouldReconnect ? "reconnecting..." : "please re-authenticate"}`);
      if (shouldReconnect) startSock();
    } else if (connection === "open") {
      console.log("✅ WhatsApp connected!");
    }
  });

  sock.ev.on("creds.update", saveCreds);

  // Reply to ping & log all messages
  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const sender = msg.key.remoteJid;
    const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text;

    console.log(`📥 Received from ${sender}: ${text}`);

    if (text?.toLowerCase() === "!ping") {
      await sock.sendMessage(sender, { text: "pong 🏓" });
    }
  });

  return sock;
}

// ========== MESSAGE SENDING ========== //
async function sendUpdate() {
  if (!sock?.user) {
    console.log("⏸ Skipping - WhatsApp not connected");
    return;
  }

  try {
    const [goldSilver, crypto, forex] = await Promise.all([
      fetchGoldSilver(),
      fetchCrypto(),
      fetchForex(),
    ]);

    if (!goldSilver || !crypto || !forex) {
      throw new Error("Failed to fetch data");
    }

    const message = formatMessage(
      {
        goldOunce: goldSilver.xauPrice,
        silverOunce: goldSilver.xagPrice,
        calculated: calculateGoldPrices(goldSilver.xauPrice, goldSilver.xagPrice),
      },
      crypto,
      forex
    );

    await sock.sendMessage(GROUP_ID, { text: message }).then(() => {
      console.log("📤 Update sent successfully");
    }).catch((err) => {
      console.error("❌ Failed to send message:", err);
    });
  } catch (error) {
    console.error("❌ Error sending update:", error.message);
  }
}

// ========== MAIN ==========
(async () => {
  try {
    await startSock();

    await new Promise(resolve => {
      const checkConnection = setInterval(() => {
        if (sock?.user) {
          clearInterval(checkConnection);
          resolve();
        }
      }, 1000);
    });

    // 🧪 Send test message on startup
    await sock.sendMessage(GROUP_ID, { text: "✅ Bot connected and ready!" });

    console.log("⏰ Starting scheduled updates...");
    cron.schedule("* * * * *", sendUpdate); // Every minute
  } catch (error) {
    console.error("🚨 Startup error:", error);
    process.exit(1);
  }
})();
