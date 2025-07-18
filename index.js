import makeWASocket, { useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import cron from 'node-cron';
import P from 'pino';
import fetch from 'node-fetch';  // You might need to install node-fetch if not available
import { setTimeout as delay } from 'timers/promises';
import moment from 'moment-timezone'; // for timezone formatting

const groupId = '120363420780867020@g.us';

async function startSock() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');
  const sock = makeWASocket({ auth: state, logger: P({ level: 'silent' }) });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('Please scan the QR code to authenticate.');
    }

    if (connection === 'open') {
      console.log('✅ Connected to WhatsApp');

      // Wait a few seconds to ensure socket is fully ready
      await delay(5000);

      // List groups
      const groups = await sock.groupFetchAllParticipating();
      console.log('Groups bot is in:');
      for (const id in groups) {
        console.log(` - ${groups[id].subject} | ID: ${id}`);
      }

      // Send test message once after connection ready
      try {
        await sendWithRetry(sock, groupId, 'Hello! Test message after full readiness.');
      } catch (err) {
        console.error('❌ Failed to send test message after retries:', err);
      }

      // Schedule message every 5 minutes
      cron.schedule('*/5 * * * *', async () => {
        try {
          const message = await generateMessage();
          console.log('⏰ Cron triggered, sending message...');
          await sendWithRetry(sock, groupId, message);
        } catch (e) {
          console.error('❌ Failed to send scheduled message:', e);
        }
      });
    }

    else if (connection === 'close') {
      const shouldReconnect = (lastDisconnect.error = new Boom(lastDisconnect?.error))?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('Connection closed. Reconnecting:', shouldReconnect);
      if (shouldReconnect) {
        startSock();
      } else {
        console.log('Logged out. Please re-authenticate.');
      }
    }
  });
}

// Retry sending message helper
async function sendWithRetry(sock, jid, message, retries = 3) {
  for (let i = 1; i <= retries; i++) {
    try {
      await sock.sendMessage(jid, { text: message });
      console.log(`📤 Message sent (attempt ${i})`);
      return;
    } catch (err) {
      console.error(`❌ Send attempt ${i} failed:`, err.message || err);
      if (i < retries) {
        await delay(3000); // wait 3 seconds before retrying
      } else {
        throw err;
      }
    }
  }
}

// === Your price fetching and message generation logic ===

const GOLD_SILVER_API = 'https://data-asg.goldprice.org/dbXRates/USD';
const CRYPTO_API = "https://api.coingecko.com/api/v3/simple/price";
const FOREX_API = "https://open.er-api.com/v6/latest/USD";

async function fetchGoldSilverPrices() {
  try {
    const res = await fetch(GOLD_SILVER_API, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const data = await res.json();
    return data?.items?.[0];
  } catch (e) {
    console.error('Error fetching gold/silver prices:', e);
    return null;
  }
}

function calculateGoldPrices(gold_oz, silver_oz) {
  const gold_g = gold_oz / 31.1;
  const silver_g = silver_oz / 31.1;
  return {
    'Msqal 21K': gold_g * 0.875 * 5,
    'Msqal 18K': gold_g * 0.750 * 5,
    'Dubai Lira 7.2g': gold_g * 0.916 * 7.2,
    '250g 995': gold_g * 0.995 * 250,
    '500g 995': gold_g * 0.995 * 500,
    '1Kg 995': gold_g * 0.995 * 1000,
    'Silver 1Kg': silver_g * 1000,
  };
}

async function fetchCryptoPrices() {
  try {
    const params = new URLSearchParams({
      ids: 'bitcoin,ethereum,ripple',
      vs_currencies: 'usd',
    });
    const res = await fetch(`${CRYPTO_API}?${params.toString()}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const data = await res.json();
    return {
      BTC: data.bitcoin?.usd,
      ETH: data.ethereum?.usd,
      XRP: data.ripple?.usd,
    };
  } catch (e) {
    console.error('Error fetching crypto prices:', e);
    return null;
  }
}

async function fetchForexRates() {
  try {
    const res = await fetch(FOREX_API);
    const json = await res.json();
    const rates = json?.rates || {};
    return {
      EUR_to_USD: rates.EUR ? 1 / rates.EUR : null,
      GBP_to_USD: rates.GBP ? 1 / rates.GBP : null,
    };
  } catch (e) {
    console.error('Error fetching forex rates:', e);
    return null;
  }
}

async function generateMessage() {
  const goldData = await fetchGoldSilverPrices();
  if (!goldData) return "❌ Couldn't fetch gold/silver prices.";

  const gold_oz = goldData.xauPrice;
  const silver_oz = goldData.xagPrice;
  if (!gold_oz || !silver_oz) return "❌ Missing ounce prices.";

  const prices = calculateGoldPrices(gold_oz, silver_oz);
  const crypto = await fetchCryptoPrices();
  const forex = await fetchForexRates();

  const btc = crypto?.BTC ? `$${crypto.BTC.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}` : "N/A";
  const eth = crypto?.ETH ? `$${crypto.ETH.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}` : "N/A";
  const xrp = crypto?.XRP ? `$${crypto.XRP.toLocaleString(undefined, {minimumFractionDigits: 4, maximumFractionDigits: 4})}` : "N/A";

  const eur = forex?.EUR_to_USD ? (forex.EUR_to_USD * 100).toFixed(2) : "N/A";
  const gbp = forex?.GBP_to_USD ? (forex.GBP_to_USD * 100).toFixed(2) : "N/A";

  const now = moment().tz('Etc/GMT-3').format('DD MMMM YYYY [at] hh:mm A');

  return (
    `${now} (GMT+3)\n` +
    "——————————————————\n" +
    `Gold Ounce Price: $${gold_oz.toFixed(2)}\n` +
    `Silver Ounce Price: $${silver_oz.toFixed(2)}\n` +
    `Bitcoin Price: ${btc}\n` +
    `Ethereum Price: ${eth}\n` +
    `XRP Price: ${xrp}\n` +
    "——————————————————\n" +
    "Gold: 🟡\n" +
    `Msqal 21K = $${prices['Msqal 21K'].toFixed(2)}\n` +
    `Msqal 18K = $${prices['Msqal 18K'].toFixed(2)}\n` +
    `Dubai Lira 7.2g = $${prices['Dubai Lira 7.2g'].toFixed(2)}\n` +
    `250g 995 = $${prices['250g 995'].toFixed(2)}\n` +
    `500g 995 = $${prices['500g 995'].toFixed(2)}\n` +
    `1Kg 995 = $${prices['1Kg 995'].toFixed(2)}\n` +
    "——————————————————\n" +
    "Silver: ⚪\n" +
    `1Kg Price: $${prices['Silver 1Kg'].toFixed(2)}\n` +
    "——————————————————\n" +
    "Forex: 💵\n" +
    `100 EUR in USD: ${eur}\n` +
    `100 GBP in USD: ${gbp}\n` +
    "——————————————————\n" +
    "تێبینی ئەونرخانە نرخی بۆرسەن"
  );
}

startSock();
