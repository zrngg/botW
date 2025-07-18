import { makeWASocket, useMultiFileAuthState, DisconnectReason } from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import cron from "node-cron";
import axios from "axios";
import pino from "pino";

const log = pino({ level: "silent" });

const GROUP_ID = "120363420780867020@g.us"; // your WhatsApp group ID

async function fetchGoldSilverPrices() {
  try {
    const res = await axios.get("https://data-asg.goldprice.org/dbXRates/USD", {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    return res.data.items?.[0] ?? null;
  } catch (e) {
    console.error("Error fetching gold/silver prices:", e.message);
    return null;
  }
}

async function fetchCryptoPrices() {
  try {
    const res = await axios.get(
      "https://api.coingecko.com/api/v3/simple/price",
      {
        params: { ids: "bitcoin,ethereum,ripple", vs_currencies: "usd" },
        headers: { "User-Agent": "Mozilla/5.0" },
      }
    );
    return {
      BTC: res.data.bitcoin?.usd,
      ETH: res.data.ethereum?.usd,
      XRP: res.data.ripple?.usd,
    };
  } catch (e) {
    console.error("Error fetching crypto prices:", e.message);
    return null;
  }
}

async function fetchForexRates() {
  try {
    const res = await axios.get("https://open.er-api.com/v6/latest/USD");
    const rates = res.data.rates;
    return {
      EUR_to_USD: rates?.EUR ? 1 / rates.EUR : null,
      GBP_to_USD: rates?.GBP ? 1 / rates.GBP : null,
    };
  } catch (e) {
    console.error("Error fetching forex rates:", e.message);
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

function generateMessage(goldData, cryptoData, forexData) {
  if (!goldData) return "❌ Couldn't fetch gold/silver prices.";

  const goldOunce = goldData.xauPrice;
  const silverOunce = goldData.xagPrice;
  if (!goldOunce || !silverOunce) return "❌ Missing ounce prices.";

  const prices = calculateGoldPrices(goldOunce, silverOunce);

  const btc = cryptoData?.BTC ? `$${cryptoData.BTC.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}` : "N/A";
  const eth = cryptoData?.ETH ? `$${cryptoData.ETH.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}` : "N/A";
  const xrp = cryptoData?.XRP ? `$${cryptoData.XRP.toFixed(4)}` : "N/A";

  const eur = forexData?.EUR_to_USD ? (forexData.EUR_to_USD * 100).toFixed(2) : "N/A";
  const gbp = forexData?.GBP_to_USD ? (forexData.GBP_to_USD * 100).toFixed(2) : "N/A";

  const now = new Date().toLocaleString("en-US", {
    timeZone: "Etc/GMT-3",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  return (
    `${now} (GMT+3)\n` +
    "——————————————————\n" +
    `Gold Ounce Price: $${goldOunce.toFixed(2)}\n` +
    `Silver Ounce Price: $${silverOunce.toFixed(2)}\n` +
    `Bitcoin Price: ${btc}\n` +
    `Ethereum Price: ${eth}\n` +
    `XRP Price: ${xrp}\n` +
    "——————————————————\n" +
    "Gold: 🟡\n" +
    `Msqal 21K = $${prices["Msqal 21K"].toFixed(2)}\n` +
    `Msqal 18K = $${prices["Msqal 18K"].toFixed(2)}\n` +
    `Dubai Lira 7.2g = $${prices["Dubai Lira 7.2g"].toFixed(2)}\n` +
    `250g 995 = $${prices["250g 995"].toFixed(2)}\n` +
    `500g 995 = $${prices["500g 995"].toFixed(2)}\n` +
    `1Kg 995 = $${prices["1Kg 995"].toFixed(2)}\n` +
    "——————————————————\n" +
    "Silver: ⚪\n" +
    `1Kg Price: $${prices["Silver 1Kg"].toFixed(2)}\n` +
    "——————————————————\n" +
    "Forex: 💵\n" +
    `100 EUR in USD: ${eur}\n` +
    `100 GBP in USD: ${gbp}\n` +
    "——————————————————\n" +
    "تێبینی ئەونرخانە نرخی بۆرسەن"
  );
}

async function startSock() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info");
  const sock = makeWASocket({ auth: state, logger: log });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      console.log("Scan the QR code to login:");
      // You can use qrcode-terminal if you want here
    }
    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      console.log("Connection closed. Status code:", statusCode);
      if (statusCode !== DisconnectReason.loggedOut) {
        console.log("Reconnecting...");
        startSock();
      } else {
        console.log("Logged out, please delete auth_info folder and re-run.");
      }
    } else if (connection === "open") {
      console.log("✅ Connected to WhatsApp");

      // Print all groups with names and IDs
      const groups = await sock.groupFetchAllParticipating();
      console.log("Groups bot is in:");
      for (const id in groups) {
        console.log(` - ${groups[id].subject} | ID: ${id}`);
      }

      // Send a test message on connect
      try {
        await sock.sendMessage(GROUP_ID, { text: "Bot connected and running!" });
        console.log("📤 Test message sent on connect");
      } catch (e) {
        console.error("❌ Failed to send test message:", e.message);
      }

      // Schedule message every 10 minutes
      cron.schedule("*/10 * * * *", async () => {
        console.log("⏰ Cron triggered at", new Date().toLocaleTimeString());

        try {
          const goldData = await fetchGoldSilverPrices();
          const cryptoData = await fetchCryptoPrices();
          const forexData = await fetchForexRates();

          const msg = generateMessage(goldData, cryptoData, forexData);
          console.log("Generated message:", msg);

          await sock.sendMessage(GROUP_ID, { text: msg });
          console.log("📤 Scheduled message sent");
        } catch (e) {
          console.error("❌ Failed to send scheduled message:", e.message);
        }
      });
    }
  });
}

startSock().catch(console.error);
