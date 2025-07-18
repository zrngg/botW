import "dotenv/config";
import { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } from "@whiskeysockets/baileys";
import P from "pino";
import cron from "node-cron";
import fetch from "node-fetch";
import moment from "moment-timezone";

const GROUP_ID = "120363420780867020@g.us";

async function fetchPrice(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Failed to fetch");
    return response.json();
  } catch (error) {
    console.error(`❌ Error fetching from ${url}`, error);
    return null;
  }
}

function formatMessage(prices) {
  const now = moment().tz("Asia/Baghdad").format("MMMM D, YYYY at hh:mm A (GMT+3)");

  return `📅 ${now}
\n—————————————
Gold Ounce Price: $${prices.gold}
Silver Ounce Price: $${prices.silver}
Bitcoin Price: $${prices.btc}
Ethereum Price: $${prices.eth}
XRP Price: $${prices.xrp}
—————————————
Gold: 🟡
Msqal 21K = $${(prices.gold / 6.857142857).toFixed(2)}
Msqal 18K = $${(prices.gold / 8).toFixed(2)}
Dubai Lira 7.2g = $${((prices.gold / 31.1) * 7.2).toFixed(2)}
250g 995 = $${((prices.gold / 31.1) * 250).toFixed(2)}
500g 995 = $${((prices.gold / 31.1) * 500).toFixed(2)}
1Kg 995 = $${((prices.gold / 31.1) * 1000).toFixed(2)}
—————————————
Silver: ⚪
1Kg Price: $${((prices.silver / 31.1) * 1000).toFixed(2)}
—————————————
Forex: 💵
100 EUR in USD: $${prices.eur}
100 GBP in USD: $${prices.gbp}
—————————————
💬 تەیبینی ئەونرخانە نرخی بۆرسەن`;
}

async function waitForSocketConnection(sock) {
  while (sock?.state?.connection !== "open") {
    console.log("⏳ Waiting for WA connection...");
    await new Promise((res) => setTimeout(res, 2000));
  }
}

async function sendGoldUpdate(sock) {
  const [gold, silver, crypto, forex] = await Promise.all([
    fetchPrice("https://api.metals.live/v1/spot/gold"),
    fetchPrice("https://api.metals.live/v1/spot/silver"),
    fetchPrice('https://api.binance.com/api/v3/ticker/price?symbols=["BTCUSDT","ETHUSDT","XRPUSDT"]'),
    fetchPrice("https://api.exchangerate.host/latest?base=EUR&symbols=USD,GBP"),
  ]);

  if (!gold || !silver || !crypto || !forex) return;

  const prices = {
    gold: gold[0],
    silver: silver[0],
    btc: Number(crypto.find((c) => c.symbol === "BTCUSDT")?.price).toLocaleString(),
    eth: Number(crypto.find((c) => c.symbol === "ETHUSDT")?.price).toLocaleString(),
    xrp: Number(crypto.find((c) => c.symbol === "XRPUSDT")?.price).toFixed(4),
    eur: forex.rates.USD.toFixed(2),
    gbp: (forex.rates.USD / forex.rates.GBP).toFixed(2),
  };

  const finalMessage = formatMessage(prices);
  await waitForSocketConnection(sock);

  try {
    await sock.sendMessage(GROUP_ID, { text: finalMessage });
    console.log("📤 Scheduled message sent");
  } catch (error) {
    console.error("❌ Failed to send scheduled message", error);
  }
}

async function startSock() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info_multi");
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
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
        await startSock();
      }
    } else if (connection === "open") {
      console.log("✅ Connected to WhatsApp");

      const groups = await sock.groupFetchAllParticipating();
      const groupNames = Object.values(groups).map((g) => ` - ${g.subject} | ID: ${g.id}`);
      console.log("Groups bot is in:\n" + groupNames.join("\n"));

      try {
        await sock.sendMessage(GROUP_ID, { text: "📤 Test message sent on connect" });
      } catch (err) {
        console.error("❌ Failed to send test message", err);
      }
    }
  });

  sock.ev.on("creds.update", saveCreds);
  return sock;
}

const sock = await startSock();

cron.schedule("*/10 * * * *", async () => {
  console.log("⏰ Cron triggered");
  await sendGoldUpdate(sock);
});
