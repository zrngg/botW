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
import qrcode from "qrcode-terminal"; // For terminal QR display

const GROUP_ID = "120363420780867020@g.us"; // Replace with your group ID

let sock; // Global socket variable

// ================== Helper Functions ================== //
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
    const url =
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,ripple&vs_currencies=usd";
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) throw new Error("Failed to fetch crypto");
    return await res.json();
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
Bitcoin Price: $${crypto.bitcoin?.usd?.toLocaleString() || "N/A"}
Ethereum Price: $${crypto.ethereum?.usd?.toLocaleString() || "N/A"}
XRP Price: $${crypto.ripple?.usd?.toFixed(4) || "N/A"}
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

// ================== WhatsApp Connection ================== //
async function startSock() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info_multi");
  const { version } = await fetchLatestBaileysVersion();

  const socketConfig = {
    version,
    auth: state,
    logger: P({ level: "silent" }),
    printQRInTerminal: false, // We'll handle QR ourselves
  };

  sock = makeWASocket(socketConfig);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    // Display QR code in terminal
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

// ================== Message Sending ================== //
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

// ================== Main Execution ================== //
(async () => {
  try {
    await startSock();

    // Wait for connection before starting cron
    await new Promise((resolve) => {
      const checkConnection = setInterval(() => {
        if (sock?.user) {
          clearInterval(checkConnection);
          resolve();
        }
      }, 1000);
    });

    console.log("⏰ Starting scheduled updates...");
    cron.schedule("* * * * *", sendUpdate); // Every minute
  } catch (error) {
    console.error("🚨 Startup error:", error);
    process.exit(1);
  }
})();
