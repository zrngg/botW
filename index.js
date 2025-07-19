import { create } from 'venom-bot';
import fetch from 'node-fetch';
import moment from 'moment-timezone';

create({
  session: "suli-borsa-session",
  multidevice: true,
  headless: "new",
  useChrome: false,
  browserArgs: ["--no-sandbox", "--disable-setuid-sandbox"],
  executablePath: "/usr/bin/chromium"
})
  .then(client => start(client))
  .catch(e => console.log(e));

async function start(client) {
  const sendPrices = async () => {
    const now = moment().tz("Asia/Baghdad").format("YYYY-MM-DD HH:mm:ss");
    const message = `🟡 Gold & Silver Update
📅 ${now}

- Gold: $2400
- Silver: $29`;
    await client.sendText('120363420780867020@g.us', message);
  };
  sendPrices();
  setInterval(sendPrices, 5 * 60 * 1000);
}
