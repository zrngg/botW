const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const cron = require('node-cron');
const qrcode = require('qrcode-terminal');

async function startSock() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    const sock = makeWASocket({ auth: state });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            qrcode.generate(qr, { small: true });
        }
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error = new Boom(lastDisconnect?.error))?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                startSock();
            }
        } else if (connection === 'open') {
            console.log('✅ Connected');

            // List all groups so you can copy the ID
            const groups = await sock.groupFetchAllParticipating();
            for (const id in groups) {
                console.log(`Group: ${groups[id].subject} | ID: ${id}`);
            }

            // Once you have your group ID, uncomment below and paste it
            const groupId = '120363420780867020@g.us'; // Replace with the actual group ID
            const message = 'Hello group! This is your bot.';

            // Send a test message to the group right away
            sock.sendMessage(groupId, { text: message })
                .then(() => console.log('📤 Test message sent to group!'))
                .catch(e => console.error('❌ Failed to send test message:', e));

            // Scheduled message to the group every minute
            cron.schedule('* * * * *', async () => {
                try {
                    await sock.sendMessage(groupId, { text: message });
                    console.log('📤 Scheduled message sent to group at', new Date().toLocaleTimeString());
                } catch (e) {
                    console.error('❌ Failed to send scheduled message to group:', e);
                }
            });
        }
    });
}

startSock();
