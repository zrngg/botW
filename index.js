
const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require("@whiskeysockets/baileys");
const axios = require("axios");
const fs = require("fs");

const GROUP_ID = "120363420780867020@g.us"; // Replace with your group ID

async function getGoldPrice() {
    try {
        const res = await axios.get("https://api.metals.dev/v1/spot/gold", {
            headers: {
                "Authorization": "Bearer demo"
            }
        });
        const price = res.data?.rates?.USD;
        return price ? `📈 Current Gold Price: $${price} / oz` : "⚠️ Failed to fetch gold price.";
    } catch (err) {
        return "⚠️ Error fetching gold price.";
    }
}

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState("auth_info_baileys");

    const { version } = await fetchLatestBaileysVersion();
    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: true
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", ({ connection, lastDisconnect }) => {
        if (connection === "close" && lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
            startBot();
        }
    });

    // Send gold price every 10 minutes
    setInterval(async () => {
        const priceMessage = await getGoldPrice();
        await sock.sendMessage(GROUP_ID, { text: priceMessage });
    }, 10 * 60 * 1000); // 10 minutes
}

startBot();
