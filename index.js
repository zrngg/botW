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

const GROUP_ID = "120363420780867020@g.us";

async function fetchGoldSilver() {
  try {
    const res = await fetch("https://data-asg.goldprice.org/dbXRates/USD", {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) throw new Error("Failed to fetch gold/silver");
    const data = await res.json();
    return data.items[0]; // Gold and silver prices
  } catch (e) {
    console.error("Error fetching gold/silver:", e);
    return null;
  }
}

async function fetchCrypto() {
  try {
    const url =
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,ripple&vs_currencies=usd";
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) throw new Error("Failed to fetch crypto");
    const data = await res.json();
    return {
      btc: data.bitcoin?.usd,
      eth: data.ethereum?.usd,
      xrp: data.ripple?.usd,
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
    const rates = data.rates || {};
    return {
      eurToUsd: 1 / (rates.EUR || 1),
      gbpToUsd: 1 / (rates.GBP || 1),
    };
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
  const now = moment().tz("Etc/GMT-3").format("DD MMMM YYYY | hh:mm A"); // GMT+3 timezone

  return `📅 ${now} (GMT+3)
—————————————
Gold Ounce Price: $${prices.goldOunce.toFixed(2)}
Silver Ounce Price: $${prices.silverOunce.toFixed(2)}
Bitcoin Price: $${crypto.btc?.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) || "N/A"}
Ethereum Price: $${crypto.eth?.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) || "N/A"}
XRP Price: $${crypto.xrp?.toFixed(4) || "N/A"}
—————————————
Gold: 🟡
Msqal 21K = $${prices.calculated["Msqal 21K"].toFixed(2)}
Msqal 18K = $${prices.calculated["Msqal 18K"].toFixed(2)}
Dubai Lira 7.2g = $${prices.calculated["Dubai Lira 7.2g"].toFixed(2)}
250g 995 = $${prices.calculated["250g 995"].toFixed(2)}
500g 995 = $${prices.calculated["500g 995"].toFixed(2)}
1Kg 995 = $${prices.calculated["1Kg 995"].toFixed(2)}
—————————————
Silver: ⚪
1Kg Price: $${prices.calculated["Silver 1Kg"].toFixed(2)}
—————————————
Forex: 💵
100 EUR in USD: ${(forex.eurToUsd * 100).toFixed(2)}
100 GBP in USD: ${(forex.gbpToUsd * 100).toFixed(2)}
—————————————
💬 تێبینی ئەونرخانە نرخی بۆرسەن
`;
}

async function waitForSocket(sock) {
  while (sock?.state?.connection !== "open") {
    console.log("⏳ Waiting for WA connection...");
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

async function sendUpdate(sock) {
  const goldSilver = await fetchGoldSilver();
  const crypto = await fetchCrypto();
  const forex = await fetchForex();

  if (!goldSilver || !crypto || !forex) {
    console.log("❌ Skipping send, data fetch failed.");
    return;
  }

  const goldOunce = goldSilver.xauPrice;
  const silverOunce = goldSilver.xagPrice;
  const calculated = calculateGoldPrices(goldOunce, silverOunce);

  const message = formatMessage(
    { goldOunce, silverOunce, calculated },
    crypto,
    forex
  );

  await waitForSocket(sock);

  try {
    await sock.sendMessage(GROUP_ID, { text: message });
    console.log("📤 Scheduled message sent");
  } catch (err) {
    console.error("❌ Error sending message:", err);
  }
}

async function startSock() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info_multi");
  const { version } = await fetchLatestBaileysVersion();

  let sock = makeWASocket({
    version,
    auth: state,
    logger: P({ level: "silent" }),
  });

  sock.ev.on("connection.update", async ({ connection, lastDisconnect }) => {
    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      if (statusCode === DisconnectReason.loggedOut) {
        console.log("❌ Logged out. Re-auth required.");
      } else {
        console.log("🔄 Connection closed. Reconnecting...");
        sock = await startSock();
      }
    } else if (connection === "open") {
      console.log("✅ Connected to WhatsApp");
      try {
        await sock.sendMessage(GROUP_ID, { text: "📤 Test message sent on connect" });
      } catch (e) {
        console.error("❌ Test message failed:", e);
      }
    }
  });

  sock.ev.on("creds.update", saveCreds);

  return sock;
}

(async () => {
  const sock = await startSock();

  cron.schedule("* * * * *", async () => {
    console.log("⏰ Cron triggered");
    await sendUpdate(sock);
  });
})();
