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

async function fetchCrypto() {
  // Fetch BTC, ETH, XRP prices from Binance API
  const symbols = ["BTCUSDT", "ETHUSDT", "XRPUSDT"];
  const prices = {};
  try {
    await Promise.all(
      symbols.map(async (symbol) => {
        const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`);
        if (!res.ok) throw new Error(`Failed to fetch ${symbol}`);
        const data = await res.json();
        prices[symbol] = parseFloat(data.price);
      })
    );
    return {
      BTC: prices["BTCUSDT"],
      ETH: prices["ETHUSDT"],
      XRP: prices["XRPUSDT"],
    };
  } catch (e) {
    console.error("Error fetching crypto:", e);
    return null;
  }
}

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

  return `*${now} (GMT+3)*
────────────────
Gold Ounce Price: $${prices.goldOunce.toFixed(2)}
Silver Ounce Price: $${prices.silverOunce.toFixed(2)}
Bitcoin Price: $${crypto?.BTC?.toLocaleString() || "N/A"}
Ethereum Price: $${crypto?.ETH?.toLocaleString() || "N/A"}
XRP Price: $${crypto?.XRP?.toFixed(4) || "N/A"}
────────────────
Gold: 🟡
Msqal 21K = $${prices.calculated["Msqal 21K"].toFixed(2)}
Msqal 18K = $${prices.calculated["Msqal 18K"].toFixed(2)}
Dubai Lira 7.2g = $${prices.calculated["Dubai Lira 7.2g"].toFixed(2)}
250g 995 = $${prices.calculated["250g 995"].toFixed(2)}
500g 995 = $${prices.calculated["500g 995"].toFixed(2)}
1Kg 995 = $${prices.calculated["1Kg 995"].toFixed(2)}
────────────────
Silver: ⚪
1Kg Price: $${prices.calculated["Silver 1Kg"].toFixed(2)}
────────────────
Forex: 💵
100 EUR in USD: ${(100 / (forex.rates.EUR || 1)).toFixed(2)}
100 GBP in USD: ${(100 / (forex.rates.GBP || 1)).toFixed(2)}
────────────────
تێبینی ئەونرخانە نرخی بۆرسەن
[Suli Borsa Whatsapp](https://chat.whatsapp.com/KFrg9RiQ7yg879MVTQGWlF)`;
}

async function startSock() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info_multi");
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    logger: P({ level: "silent" }),
    printQRInTerminal: false,
  });

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log("🔍 Scan this QR code with WhatsApp:");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "close") {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log(
        `Connection closed, ${
          shouldReconnect ? "reconnecting" : "please relogin"
        }...`
      );
      if (shouldReconnect) startSock();
    } else if (connection === "open") {
      console.log("✅ WhatsApp connected!");
    }
  });

  sock.ev.on("creds.update", saveCreds);
  return sock;
}

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

    const imageUrl = "https://i.imgur.com/NiKMpdF.jpeg";

    await sock.sendMessage(GROUP_ID, {
      image: { url: imageUrl },
      caption: message,
    });

    console.log("📤 Update sent successfully with image");
  } catch (error) {
    console.error("❌ Error sending update:", error.message);
  }
}

(async () => {
  try {
    await startSock();

    await new Promise((resolve) => {
      const checkConnection = setInterval(() => {
        if (sock?.user) {
          clearInterval(checkConnection);
          resolve();
        }
      }, 1000);
    });

    console.log("⏰ Starting scheduled updates...");
    cron.schedule("*/5 * * * *", sendUpdate); // Every 5 minutes
  } catch (error) {
    console.error("🚨 Startup error:", error);
    process.exit(1);
  }
})();
