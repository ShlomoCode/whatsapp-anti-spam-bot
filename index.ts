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
	console.log("🔍 Extracting text from message...");
	const content = extractMessageContent(message.message);
	if (!content) {
		console.log("⚠️ =============== NO CONTENT FOUND IN MESSAGE ===============");
		return "";
	}

	console.log(`🔍 Checking conversation: ${content.conversation || 'none'}`);
	console.log(`🔍 Checking extendedTextMessage: ${content.extendedTextMessage?.text || 'none'}`);
	console.log(`🔍 Checking imageMessage caption: ${content.imageMessage?.caption || 'none'}`);
	console.log(`🔍 Checking videoMessage caption: ${content.videoMessage?.caption || 'none'}`);
	console.log(`🔍 Checking documentMessage caption: ${content.documentMessage?.caption || 'none'}`);

	const text = (
		content.conversation ||
		content.extendedTextMessage?.text ||
		content.imageMessage?.caption ||
		content.videoMessage?.caption ||
		content.documentMessage?.caption ||
		""
	);

	console.log(`📝 =============== FINAL EXTRACTED TEXT ===============`);
	console.log(`📝 Text Length: ${text.length}`);
	console.log(`📝 Text Content: "${text}"`);
	console.log(`📝 =============== TEXT EXTRACTION COMPLETE ===============`);
	return text;
}

async function isSpamMessage(text: string): Promise<boolean> {
	console.log(`🔎 Checking if text is spam: "${text}"`);
	const result = await Promise.resolve(config.isSpam(text));
	console.log(`${result ? '🚨' : '✅'} Spam check result: ${result ? 'SPAM DETECTED!' : 'Not spam'}`);
	return result;
}

async function handleMessage(
	sock: WASocket,
	message: proto.IWebMessageInfo,
): Promise<void> {
	console.log("📤 Processing message...");
	if (
		!message.key ||
		!isGroupMessage(message.key) ||
		isSelfMessage(message.key)
	) {
		console.log("⏭️ Skipping message (not group message or self message)");
		return;
	}

	const groupJid = message.key.remoteJid;
	const senderJid = message.key.participant;
	console.log(`📍 Message details - Group: ${groupJid}, Sender: ${senderJid}`);

	if (!senderJid || !groupJid) {
		console.log("⚠️ Missing sender or group JID, skipping...");
		return;
	}

	const messageText = getMessageText(message);
	const isSpam = await isSpamMessage(messageText);
	if (messageText && isSpam) {
		console.log("🚨 SPAM DETECTED - Taking action...");
		console.log("📋 Getting group metadata...");
		const groupMetadata = await getGroupMetadata(sock, groupJid);
		const botJid = getBotJid(sock);

		if (!botJid) {
			console.log("⚠️ No bot JID found, cannot proceed");
			return;
		}

		const botIsAdmin = isAdminOrSuperAdmin(groupMetadata, botJid);
		console.log(`🔑 Bot admin status: ${botIsAdmin ? 'ADMIN' : 'NOT ADMIN'}`);

		if (botIsAdmin) {
			console.log("🗑️ Deleting spam message...");
			await deleteMessage(sock, message.key);

			console.log("🔍 Checking if group is in community...");
			const communityJid = await isGroupInCommunity(sock, groupJid);

			if (communityJid) {
				console.log(`🏠 Group is in community ${communityJid}, removing user from all community groups`);
				await kickUserFromCommunity(sock, communityJid, senderJid);
			} else {
				console.log("🏠 Group is standalone, removing user from this group only");
				await sock.groupParticipantsUpdate(groupJid, [senderJid], "remove");
			}
			console.log("✅ Spam handling completed successfully");
		} else {
			console.log("⚠️ Bot is not admin, sending warning message instead");
			const communityJid = await isGroupInCommunity(sock, groupJid);
			const messageText = communityJid
				? "⚠️ זוהתה הודעת ספאם אך אין לי הרשאות ניהול  כדי למחוק אותה ולהעיף את הספאמר\n🛡️ כדי שאוכל לשמור על נקיות הקהילה, יש למנות אותי כמנהל הקהילה"
				: "⚠️ זוהתה הודעת ספאם אך אין לי הרשאות ניהול בקבוצה זו כדי למחוק אותה ולהעיף את הספאמר\n🛡️ כדי שאוכל לשמור על נקיות הקבוצה, יש למנות אותי כמנהל";

			console.log("📢 Sending warning message...");
			await sendMessage(
				sock,
				groupJid,
				{ text: messageText },
				{ quoted: message },
			);
			console.log("✅ Warning message sent");
		}
	} else if (messageText) {
		console.log("✅ Message processed - no spam detected");
	} else {
		console.log("💭 No text content in message, skipping spam check");
	}
}

async function main(): Promise<void> {
	console.log("🚀 Starting WhatsApp Anti-Spam Bot...");
	console.log("📡 Initializing WhatsApp connection...");

	const sock = await initializeWhatsApp();

	sock.ev.on("messages.upsert", async ({ messages }) => {
		for (const message of messages) {
			try {
				console.log(`📨 Received new message from ${message.key.participant || 'unknown'} in group ${message.key.remoteJid || 'unknown'}`);
				await handleMessage(sock, message);
			} catch (error) {
				console.error("❌ Error handling message:", error);
			}
		}
	});
}

main().catch(console.error);
