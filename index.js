import { create } from 'venom-bot';
import moment from 'moment-timezone';
import fs from 'fs/promises';
import path from 'path';

const SESSION_FOLDER = path.resolve('./tokens/suli-borsa-session');

async function removeSessionFolder() {
  try {
    await fs.rm(SESSION_FOLDER, { recursive: true, force: true });
    console.log('✅ Session folder cleaned');
  } catch (e) {
    console.warn('⚠️ Could not clean session folder:', e.message);
  }
}

async function startBot() {
  await removeSessionFolder();

  create({
    session: 'suli-borsa-session',
    multidevice: true,
    headless: true,
    executablePath: '/usr/bin/chromium-browser',
    browserArgs: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-features=RendererCodeIntegrity',
    ],
  })
    .then(client => start(client))
    .catch(err => {
      console.error('❌ Venom launch error:', err);
    });
}

async function start(client) {
  const sendPrices = async () => {
    const now = moment().tz('Asia/Baghdad').format('YYYY-MM-DD HH:mm:ss');
    const message = `🟡 Gold & Silver Update
📅 ${now}

- Gold: $2400
- Silver: $29`;
    try {
      await client.sendText('120363420780867020@g.us', message);
      console.log('✅ Message sent at', now);
    } catch (error) {
      console.error('❌ Failed to send message:', error);
    }
  };

  await sendPrices();
  setInterval(sendPrices, 5 * 60 * 1000);
}

startBot();
