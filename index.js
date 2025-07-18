import { makeWASocket, useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import cron from 'node-cron';
import fetch from 'node-fetch';
import P from 'pino';

async function startSock() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');
  const sock = makeWASocket({ auth: state, logger: P({ level: 'silent' }) });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      console.log('Scan this QR code in your WhatsApp app to login:');
      // Optionally generate QR here with qrcode-terminal if you want
    }
    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect.error = new Boom(lastDisconnect?.error))?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) {
        console.log('Connection closed. Reconnecting...');
        startSock();
      } else {
        console.log('Connection closed. You are logged out.');
      }
    } else if (connection === 'open') {
      console.log('✅ Connected to WhatsApp');

      // Fetch and log all groups bot is in
      const groups = await sock.groupFetchAllParticipating();
      console.log('Groups bot is in:');
      for (const id in groups) {
        console.log(` - ${groups[id].subject} | ID: ${id}`);
      }

      const groupId = '120363420780867020@g.us';

      // Send immediate test message
      try {
        await sock.sendMessage(groupId, { text: 'Hello! Test message from your bot on connect.' });
        console.log('📤 Test message sent on connect');
      } catch (err) {
        console.error('❌ Failed to send test message:', err);
      }

      // Scheduled message every 5 minutes
      cron.schedule('*/5 * * * *', async () => {
        console.log('⏰ Cron triggered at', new Date().toLocaleTimeString());
        try {
          const message = await generateMessage();
          console.log('Generated message:', message);
          await sock.sendMessage(groupId, { text: message });
          console.log('📤 Scheduled message sent');
        } catch (e) {
          console.error('❌ Failed to send scheduled message:', e);
        }
      });
    }
  });
}

async function fetchGoldSilverPrices() {
  try {
    const res = await fetch('https://data-asg.goldprice.org/dbXRates/USD', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    const json = await res.json();
    return json.items?.[0];
  } catch (e) {
    console.error('Error fetching gold/silver prices:', e);
    return null;
  }
}

function calculateGoldPrices(goldOz, silverOz) {
  const goldG = goldOz / 31.1;
  const silverG = silverOz / 31.1;
  return {
    'Msqal 21K': goldG * 0.875 * 5,
    'Msqal 18K': goldG * 0.75 * 5,
    'Dubai Lira 7.2g': goldG * 0.916 * 7.2,
    '250g 995': goldG * 0.995 * 250,
    '500g 995': goldG * 0.995 * 500,
    '1Kg 995': goldG * 0.995 * 1000,
    'Silver 1Kg': silverG * 1000,
  };
}

async function fetchCryptoPrices() {
  try {
    const params = new URLSearchParams({
      ids: 'bitcoin,ethereum,ripple',
      vs_currencies: 'usd',
    });
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?${params.toString()}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    const json = await res.json();
    return {
      BTC: json.bitcoin?.usd,
      ETH: json.ethereum?.usd,
      XRP: json.ripple?.usd,
    };
  } catch (e) {
    console.error('Error fetching crypto prices:', e);
    return null;
  }
}

async function fetchForexRates() {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    const json = await res.json();
    const rates = json.rates || {};
    return {
      EUR_to_USD: rates.EUR ? 1 / rates.EUR : null,
      GBP_to_USD: rates.GBP ? 1 / rates.GBP : null,
    };
  } catch (e) {
    console.error('Error fetching forex rates:', e);
    return null;
  }
}

function formatNumber(num, decimals = 2) {
  if (num === null || num === undefined) return 'N/A';
  return num.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

async function generateMessage() {
  const goldData = await fetchGoldSilverPrices();
  if (!goldData) return '❌ Could not fetch gold/silver prices.';

  const goldOz = goldData.xauPrice;
  const silverOz = goldData.xagPrice;
  if (!goldOz || !silverOz) return '❌ Missing gold or silver ounce price.';

  const prices = calculateGoldPrices(goldOz, silverOz);
  const crypto = await fetchCryptoPrices();
  const forex = await fetchForexRates();

  const btc = crypto?.BTC ? `$${formatNumber(crypto.BTC, 2)}` : 'N/A';
  const eth = crypto?.ETH ? `$${formatNumber(crypto.ETH, 2)}` : 'N/A';
  const xrp = crypto?.XRP ? `$${formatNumber(crypto.XRP, 4)}` : 'N/A';

  const eur = forex?.EUR_to_USD ? formatNumber(forex.EUR_to_USD * 100, 2) : 'N/A';
  const gbp = forex?.GBP_to_USD ? formatNumber(forex.GBP_to_USD * 100, 2) : 'N/A';

  const now = new Date().toLocaleString('en-GB', {
    timeZone: 'Etc/GMT-3',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  return (
    `${now} (GMT+3)\n` +
    '——————————————————\n' +
    `Gold Ounce Price: $${formatNumber(goldOz)}\n` +
    `Silver Ounce Price: $${formatNumber(silverOz)}\n` +
    `Bitcoin Price: ${btc}\n` +
    `Ethereum Price: ${eth}\n` +
    `XRP Price: ${xrp}\n` +
    '——————————————————\n' +
    'Gold: 🟡\n' +
    `Msqal 21K = $${formatNumber(prices['Msqal 21K'])}\n` +
    `Msqal 18K = $${formatNumber(prices['Msqal 18K'])}\n` +
    `Dubai Lira 7.2g = $${formatNumber(prices['Dubai Lira 7.2g'])}\n` +
    `250g 995 = $${formatNumber(prices['250g 995'])}\n` +
    `500g 995 = $${formatNumber(prices['500g 995'])}\n` +
    `1Kg 995 = $${formatNumber(prices['1Kg 995'])}\n` +
    '——————————————————\n' +
    'Silver: ⚪\n' +
    `1Kg Price: $${formatNumber(prices['Silver 1Kg'])}\n` +
    '——————————————————\n' +
    'Forex: 💵\n' +
    `100 EUR in USD: ${eur}\n` +
    `100 GBP in USD: ${gbp}\n` +
    '——————————————————\n' +
    'تێبینی ئەونرخانە نرخی بۆرسەن'
  );
}

startSock();
