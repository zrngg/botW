import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import cron from "node-cron";
import axios from "axios";

async function fetchGoldCryptoForexMessage() {
  try {
    const goldRes = await axios.get(
      "https://data-asg.goldprice.org/dbXRates/USD",
      { headers: { "User-Agent": "Mozilla/5.0" } }
    );
    const goldData = goldRes.data.items?.[0];
    if (!goldData) return "❌ Couldn't fetch gold/silver prices.";

    const gold_oz = goldData.xauPrice;
    const silver_oz = goldData.xagPrice;

    const gold_g = gold_oz / 31.1;
    const silver_g = silver_oz / 31.1;

    const cryptoRes = await axios.get(
      "https://api.coingecko.com/api/v3/simple/price",
      {
        params: { ids: "bitcoin,ethereum,ripple", vs_currencies: "usd" },
        headers: { "User-Agent": "Mozilla/5.0" },
      }
    );
    const crypto = cryptoRes.data;

    const forexRes = await axios.get("https://open.er-api.com/v6/latest/USD");
    const rates = forexRes.data.rates;

    const now = new Date().toLocaleString("en-US", {
      timeZone: "Etc/GMT-3",
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).replace(",", " at");

    return (
      `${now} (GMT+3)\n` +
      "——————————————————\n" +
      `Gold Ounce Price: $${gold_oz.toFixed(2)}\n` +
      `Silver Ounce Price: $${silver_oz.toFixed(2)}\n` +
      `Bitcoin Price: $${crypto.bitcoin.usd.toLocaleString()}\n` +
      `Ethereum Price: $${crypto.ethereum.usd.toLocaleString()}\n` +
      `XRP Price: $${crypto.ripple.usd.toFixed(4)}\n` +
      "——————————————————\n" +
      "Gold: 🟡\n" +
      `Msqal 21K = $${(gold_g * 0.875 * 5).toFixed(2)}\n` +
      `Msqal 18K = $${(gold_g * 0.75 * 5).toFixed(2)}\n` +
      `Dubai Lira 7.2g = $${(gold_g * 0.916 * 7.2).toFixed(2)}\n` +
      `250g 995 = $${(gold_g * 0.995 * 250).toFixed(2)}\n` +
      `500g 995 = $${(gold_g * 0.995 * 500).toFixed(2)}\n` +
      `1Kg 995 = $${(gold_g * 0.995 * 1000).toFixed(2)}\n` +
      "——————————————————\n" +
      "Silver: ⚪\n" +
      `1Kg Price: $${(silver_g * 1000).toFixed(2)}\n` +
      "——————————————————\n" +
      "Forex: 💵\n" +
      `100 EUR in USD: ${(100 / rates.EUR).toFixed(2)}\n` +
      `100 GBP in USD: ${(100 / rates.GBP).toFixed(2)}\n` +
      "——————————————————\n" +
      "تێبینی ئەونرخانە نرخی بۆرسەن"
    );
  } catch (error) {
    console.error("Error generating message:", error);
    return "❌ Error fetching data.";
  }
}

async function startSock() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info");
  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log("Scan this QR code to connect:");
      // Baileys prints QR code in terminal automatically
    }

    if (connection === "close") {
      const shouldReconnect =
        (lastDisconnect?.error &&
          new Boom(lastDisconnect.error).output.statusCode !==
            DisconnectReason.loggedOut) ??
        true;
      console.log(
        `Connection closed. Reconnecting: ${shouldReconnect ? "true" : "false"}`
      );
      if (shouldReconnect) {
        startSock();
      }
    } else if (connection === "open") {
      console.log("✅ Connected to WhatsApp");

      const groups = await sock.groupFetchAllParticipating();
      console.log("Groups bot is in:");
      for (const id in groups) {
        console.log(` - ${groups[id].subject} | ID: ${id}`);
      }

      const groupId = "120363420780867020@g.us"; // Your group ID
      try {
        const message = await fetchGoldCryptoForexMessage();

        await sock.sendMessage(groupId, { text: message });
        console.log("📤 Test message sent on connect");
      } catch (e) {
        console.error("❌ Failed to send test message:", e);
      }

      cron.schedule("* * * * *", async () => {
        console.log("⏰ Cron triggered at", new Date().toLocaleTimeString());
        try {
          const msg = await fetchGoldCryptoForexMessage();
          await sock.sendMessage(groupId, { text: msg });
          console.log("📤 Scheduled message sent");
        } catch (e) {
          console.error("❌ Failed to send scheduled message:", e);
        }
      });
    }
  });
}

startSock().catch(console.error);
