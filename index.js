import { create } from 'venom-bot';
import moment from 'moment-timezone';
import { promises as fs } from 'fs';
import path from 'path';

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
  '--remote-debugging-port=9222',
  `--user-data-dir=/tmp/chrome_profile`,
  '--remote-debugging-address=0.0.0.0'
];

console.log('Initializing WhatsApp bot...');

// Clear previous session data
async function cleanSession() {
  try {
    const sessionDir = path.join('tokens', 'suli-borsa-session');
    await fs.rm(sessionDir, { recursive: true, force: true });
    await fs.rm('/tmp/chrome_profile', { recursive: true, force: true });
    console.log('Previous session cleaned');
  } catch (err) {
    console.log('No previous session to clean');
  }
}

// Main initialization
async function initializeBot() {
  await cleanSession();

  try {
    const client = await create({
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
        userDataDir: '/tmp/chrome_profile'
      },
      disableSpins: true,
      disableWelcome: true,
      updatesLog: false,
      logQR: true,  // Enable QR code logging
      autoClose: 0,
      createPath: path.join(process.cwd(), 'tokens')
    });

    console.log('Bot initialized successfully');
    start(client);
  } catch (error) {
    console.error('Initialization failed:', error);
    process.exit(1);
  }
}

// Bot functionality
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

  // Initial send and then every 5 minutes
  await sendPrices();
  setInterval(sendPrices, 5 * 60 * 1000);
  
  // Connection monitoring
  client.onStreamChange((state) => {
    console.log('Connection state:', state);
  });
}

// Start the bot
initializeBot();
