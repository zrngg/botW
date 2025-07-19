import { create } from 'venom-bot';
import moment from 'moment-timezone';

const browserArgs = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-accelerated-2d-canvas',
  '--no-first-run',
  '--no-zygote',
  '--single-process',
  '--disable-gpu',
  '--disable-infobars',
  '--window-position=0,0',
  '--ignore-certificate-errors',
  '--ignore-certificate-errors-spki-list',
  `--user-data-dir=/tmp/chrome`,
  '--remote-debugging-port=9222',
  '--remote-debugging-address=0.0.0.0'
];

console.log('Starting WhatsApp bot...');

// Clear any existing session locks
try {
  const fs = await import('fs');
  const path = await import('path');
  const sessionDir = path.join('tokens', 'suli-borsa-session');
  if (fs.existsSync(sessionDir)) {
    fs.rmSync(sessionDir, { recursive: true, force: true });
  }
} catch (err) {
  console.log('Error cleaning session:', err);
}

create({
  session: "suli-borsa-session",
  multidevice: true,
  headless: true,
  useChrome: false,
  browserArgs,
  puppeteerOptions: {
    args: browserArgs,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
    headless: 'new',
    ignoreHTTPSErrors: true,
    userDataDir: '/tmp/chrome'
  },
  disableSpins: true,
  disableWelcome: true,
  updatesLog: false,
  logQR: false,
  autoClose: 0
})
.then(async (client) => {
  console.log('Bot started successfully');
  await start(client);
})
.catch((err) => {
  console.error('Bot initialization error:', err);
  process.exit(1);
});

async function start(client) {
  const sendPrices = async () => {
    try {
      const now = moment().tz("Asia/Baghdad").format("YYYY-MM-DD HH:mm:ss");
      const message = `🟡 Gold & Silver Update
📅 ${now}

- Gold: $2400
- Silver: $29`;
      
      await client.sendText('120363420780867020@g.us', message);
      console.log('Prices sent successfully at', now);
    } catch (err) {
      console.error('Error sending prices:', err);
    }
  };

  await sendPrices();
  setInterval(sendPrices, 5 * 60 * 1000);
  
  client.onStreamChange((state) => {
    console.log('Connection state changed:', state);
  });
}
