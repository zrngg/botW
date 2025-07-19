import { create } from 'venom-bot';
import moment from 'moment-timezone';
import fs from 'fs';
import path from 'path';

const sessionPath = path.join('tokens', 'suli-borsa-session');

// Ensure session directory exists
if (!fs.existsSync('tokens')) {
  fs.mkdirSync('tokens');
}

const browserArgs = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-accelerated-2d-canvas',
  '--no-first-run',
  '--no-zygote',
  '--single-process',
  '--disable-gpu',
  `--user-data-dir=/tmp/chrome_profile`
];

console.log('Initializing WhatsApp bot with existing session...');

create({
  session: "suli-borsa-session",
  multidevice: true,
  headless: true,
  useChrome: false,
  browserArgs,
  puppeteerOptions: {
    args: browserArgs,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
    userDataDir: '/tmp/chrome_profile'
  },
  disableSpins: true,
  disableWelcome: true,
  updatesLog: false,
  logQR: false, // Disable QR since we're using existing session
  autoClose: 0
})
.then(client => {
  console.log('Successfully resumed existing session');
  start(client);
})
.catch(async err => {
  console.error('Session resume failed:', err);
  // If session resume fails, try fresh authentication
  console.log('Attempting fresh authentication...');
  await fs.promises.rm(sessionPath, { recursive: true, force: true });
  initializeFreshSession();
});

async function initializeFreshSession() {
  const client = await create({
    session: "suli-borsa-session",
    headless: false, // Show browser for QR scan
    logQR: true
  });
  start(client);
}

function start(client) {
  const sendPrices = async () => {
    const now = moment().tz("Asia/Baghdad").format("YYYY-MM-DD HH:mm:ss");
    const message = `🟡 Gold & Silver Update
📅 ${now}

- Gold: $2400
- Silver: $29`;
    
    await client.sendText('120363420780867020@g.us', message);
    console.log('Prices sent at', now);
  };

  sendPrices();
  setInterval(sendPrices, 5 * 60 * 1000);
}
