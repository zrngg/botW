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
  '--disable-gpu'
];

console.log('Starting WhatsApp bot...');

create({
  session: "suli-borsa-session",
  multidevice: true,
  headless: true,
  useChrome: false,
  browserArgs,
  puppeteerOptions: {
    args: browserArgs,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
    headless: true,
    ignoreHTTPSErrors: true
  }
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

  // Send immediately and then every 5 minutes
  await sendPrices();
  setInterval(sendPrices, 5 * 60 * 1000);
  
  // Keep alive handler
  client.onStreamChange((state) => {
    console.log('Connection state changed:', state);
  });
}
