import type { proto, WASocket } from "baileys";
import { extractMessageContent } from "baileys";
import { config } from "./config.js";
import {
	deleteMessage,
	getBotJid,
	getGroupMetadata,
	initializeWhatsApp,
	isAdminOrSuperAdmin,
	isGroupInCommunity,
	isGroupMessage,
	isSelfMessage,
	kickUserFromCommunity,
	sendMessage,
} from "./whatsapp.js";

function getMessageText(message: proto.IWebMessageInfo): string {
	const content = extractMessageContent(message.message);
	if (!content) return "";

	return (
		content.conversation ||
		content.extendedTextMessage?.text ||
		content.imageMessage?.caption ||
		content.videoMessage?.caption ||
		content.documentMessage?.caption ||
		""
	);
}

async function isSpamMessage(text: string): Promise<boolean> {
	return await Promise.resolve(config.isSpam(text));
}

async function handleMessage(
	sock: WASocket,
	message: proto.IWebMessageInfo,
): Promise<void> {
	if (
		!message.key ||
		!isGroupMessage(message.key) ||
		isSelfMessage(message.key)
	) {
		return;
	}

	const groupJid = message.key.remoteJid;
	const senderJid = message.key.participant;

	if (!senderJid || !groupJid) return;
	
	const messageText = getMessageText(message);
	const isSpam = await isSpamMessage(messageText);
	if (messageText && isSpam) {
		const groupMetadata = await getGroupMetadata(sock, groupJid);
		const botJid = getBotJid(sock);

		if (!botJid) return;

		const botIsAdmin = isAdminOrSuperAdmin(groupMetadata, botJid);

		if (botIsAdmin) {
			await deleteMessage(sock, message.key);

			const communityJid = await isGroupInCommunity(sock, groupJid);

			if (communityJid) {
				await kickUserFromCommunity(sock, communityJid, senderJid);
			} else {
				await sock.groupParticipantsUpdate(groupJid, [senderJid], "remove");
			}
		} else {
			const communityJid = await isGroupInCommunity(sock, groupJid);
			const messageText = communityJid
				? "⚠️ זוהתה הודעת ספאם אך אין לי הרשאות ניהול  כדי למחוק אותה ולהעיף את הספאמר\n🛡️ כדי שאוכל לשמור על נקיות הקהילה, יש למנות אותי כמנהל הקהילה"
				: "⚠️ זוהתה הודעת ספאם אך אין לי הרשאות ניהול בקבוצה זו כדי למחוק אותה ולהעיף את הספאמר\n🛡️ כדי שאוכל לשמור על נקיות הקבוצה, יש למנות אותי כמנהל";

			await sendMessage(
				sock,
				groupJid,
				{ text: messageText },
				{ quoted: message },
			);
		}
	}
}

async function main(): Promise<void> {
	console.log("🚀 Starting WhatsApp Anti-Spam Bot...");
	console.log("📡 Initializing WhatsApp connection...");

	const sock = await initializeWhatsApp();

	sock.ev.on("messages.upsert", async ({ messages }) => {
		for (const message of messages) {
			try {
				await handleMessage(sock, message);
			} catch (error) {
				console.error("Error handling message:", error);
			}
		}
	});
}

main().catch(console.error);
