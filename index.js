import venom from "venom-bot";
import fetch from "node-fetch";
import moment from "moment-timezone";
import fs from "fs";
import puppeteer from "puppeteer"; // <-- import puppeteer

const GROUP_ID = "120363420780867020@g.us";

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
    const btcRes = await fetch("https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT");
    const btcData = await btcRes.json();

    const cgRes = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=ethereum,ripple&vs_currencies=usd"
    );
    const cgData = await cgRes.json();

    return {
      BTC: parseFloat(btcData.price),
      ETH: cgData.ethereum?.usd,
      XRP: cgData.ripple?.usd,
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

  const eur = forex.rates.EUR ? (100 / forex.rates.EUR).toFixed(2) : "N/A";
  const gbp = forex.rates.GBP ? (100 / forex.rates.GBP).toFixed(2) : "N/A";

  return `📅 ${now} (GMT+3)
────────────────
Gold Ounce: $${prices.goldOunce.toFixed(2)}
Silver Ounce: $${prices.silverOunce.toFixed(2)}
Bitcoin: $${crypto.BTC ? crypto.BTC.toLocaleString() : "N/A"}
Ethereum: $${crypto.ETH ? crypto.ETH.toLocaleString() : "N/A"}
XRP: $${crypto.XRP ? crypto.XRP.toFixed(4) : "N/A"}
────────────────
Gold:
Msqal 21K = $${prices.calculated["Msqal 21K"].toFixed(2)}
Msqal 18K = $${prices.calculated["Msqal 18K"].toFixed(2)}
Dubai Lira 7.2g = $${prices.calculated["Dubai Lira 7.2g"].toFixed(2)}
────────────────
Silver:
1Kg = $${prices.calculated["Silver 1Kg"].toFixed(2)}
────────────────
Forex:
100 EUR = $${eur}
100 GBP = $${gbp}
────────────────
*تێبینی ئەونرخانە نرخی بۆرسەن*

*[Suli Borsa Telegram](https://t.me/suliborsa)*`;
}

venom
  .create({
    session: "suli-borsa-session",
    multidevice: true,
    headless: "new",
    useChrome: true,
    puppeteerOptions: {
      executablePath: puppeteer.executablePath(), // explicit chromium path
      args: ["--no-sandbox", "--disable-setuid-sandbox"], // required for Railway
    },
  })
  .then(async (client) => {
    console.log("✅ WhatsApp connected!");

    async function sendUpdate() {
      try {
        const [goldSilver, crypto, forex] = await Promise.all([
          fetchGoldSilver(),
          fetchCrypto(),
          fetchForex(),
        ]);

        if (!goldSilver || !crypto || !forex) {
          throw new Error("Failed to fetch all data");
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

        const imagePath = "./update.jpg"; // Make sure you have this file in the same folder!

        if (!fs.existsSync(imagePath)) {
          console.warn("⚠️ Image not found, sending text only.");
          await client.sendText(GROUP_ID, message);
          return;
        }

        await client.sendImage(GROUP_ID, imagePath, "update.jpg", message);

        console.log("📤 Update sent successfully");
      } catch (error) {
        console.error("❌ Error sending update:", error);
      }
    }

    await sendUpdate();
    setInterval(sendUpdate, 10 * 60 * 1000); // every 10 minutes
  })
  .catch(console.error);
