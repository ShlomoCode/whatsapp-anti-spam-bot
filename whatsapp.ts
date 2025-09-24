import assert from "node:assert";
import { setTimeout as sleep } from "node:timers/promises";
import makeWASocket, {
	type AnyMessageContent,
	DisconnectReason,
	type GroupMetadata,
	type proto,
	useMultiFileAuthState,
	type WAMessageKey,
	type WASocket,
} from "baileys";
import { pino } from "pino";
import { config } from "./config.js";

const logger = pino({ level: "warn" });

export async function initializeWhatsApp(): Promise<WASocket> {
	const { state, saveCreds } = await useMultiFileAuthState(config.authFolder);

	const sock = makeWASocket({
		auth: state,
		logger,
		markOnlineOnConnect: config.botSettings.markOnlineOnConnect,
		keepAliveIntervalMs: config.botSettings.keepAliveIntervalMs,
	});

	sock.ev.on("creds.update", saveCreds);

	sock.ev.on("connection.update", async (update) => {
		const { connection, lastDisconnect, qr } = update;

		if (qr) {
			const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`;
			console.log("QR Code Image:", qrUrl);
			console.log("===============");
		}

		if (connection === "open") {
			console.log("✅ WhatsApp connected successfully!");
		}

		if (connection === "close") {
			console.log("❌ WhatsApp connection closed");
			const shouldReconnect =
				(lastDisconnect?.error as { output?: { statusCode: number } })?.output
					?.statusCode !== DisconnectReason.loggedOut;
			if (shouldReconnect) {
				console.log("🔄 Attempting to reconnect...");
				return await initializeWhatsApp();
			} else {
				console.log("🚪 Logged out - not reconnecting");
			}
		}
	});

	return sock;
}

export function isAdminOrSuperAdmin(
	groupMetadata: GroupMetadata,
	userJid: string,
): boolean {
	const senderParticipant = groupMetadata.participants.find(
		(p) => p.phoneNumber === `${userJid.split(":")[0]}@s.whatsapp.net`,
	);
	return (
		senderParticipant?.admin === "admin" ||
		senderParticipant?.admin === "superadmin"
	);
}

export async function isGroupInCommunity(
	sock: WASocket,
	groupJid: string,
): Promise<string | null> {
	const groupMetadata = await getGroupMetadata(sock, groupJid);
	return groupMetadata.linkedParent || null;
}

export async function getCommunityGroups(
	sock: WASocket,
	communityJid: string,
): Promise<string[]> {
	await sleep(1500);
	const allGroups = await sock.groupFetchAllParticipating();
	const communityGroups: string[] = [];

	for (const groupJid of Object.keys(allGroups)) {
		await sleep(1500);

		const groupMetadata = await getGroupMetadata(sock, groupJid);
		const linkedParent = groupMetadata.linkedParent;
		if (linkedParent === communityJid) {
			communityGroups.push(groupJid);
		}
	}

	return communityGroups;
}

export async function kickUserFromCommunity(
	sock: WASocket,
	communityJid: string,
	userJid: string,
): Promise<void> {
	await sleep(1500);

	const communityGroups = await getCommunityGroups(sock, communityJid);

	for (const groupJid of communityGroups) {
		await sleep(1500);

		const groupMetadata = await getGroupMetadata(sock, groupJid);
		const botJid = getBotJid(sock);

		if (!botJid) continue;

		if (isAdminOrSuperAdmin(groupMetadata, botJid)) {
			const participants = groupMetadata.participants;
			const userExists = participants.some((p) => p.id === userJid);

			if (userExists && !isAdminOrSuperAdmin(groupMetadata, userJid)) {
				await sock.groupParticipantsUpdate(groupJid, [userJid], "remove");
				await sleep(1500);
			}
		}
	}

	const communityMetadata = await getCommunityMetadata(sock, communityJid);
	const botJid = getBotJid(sock);

	if (!botJid) return;

	if (isAdminOrSuperAdmin(communityMetadata, botJid)) {
		const participants = communityMetadata.participants;
		const userExistsInCommunity = participants.some((p) => p.id === userJid);
		if (
			userExistsInCommunity &&
			!isAdminOrSuperAdmin(communityMetadata, userJid)
		) {
			await sock.groupParticipantsUpdate(communityJid, [userJid], "remove");
		}
	}
}

export async function getGroupMetadata(
	sock: WASocket,
	groupJid: string,
): Promise<GroupMetadata> {
	await sleep(1500);

	return await sock.groupMetadata(groupJid);
}

export async function getCommunityMetadata(
	sock: WASocket,
	communityJid: string,
): Promise<GroupMetadata> {
	await sleep(1500);

	const communityMetadata = await getGroupMetadata(sock, communityJid);
	assert(communityMetadata.isCommunity, `${communityJid} is not a community`);
	return communityMetadata;
}

export function getBotJid(sock: WASocket): string | undefined {
	return sock.authState.creds.me?.id;
}

export function isGroupMessage(messageKey: WAMessageKey): boolean {
	return messageKey.remoteJid?.endsWith("@g.us") || false;
}

export function isSelfMessage(messageKey: WAMessageKey): boolean {
	return messageKey.fromMe ?? false;
}

export async function sendMessage(
	sock: WASocket,
	toJid: string,
	content: AnyMessageContent,
	options?: { quoted?: proto.IWebMessageInfo },
): Promise<proto.WebMessageInfo | undefined> {
	await sleep(1500);
	return await sock.sendMessage(toJid, content, options);
}

export async function deleteMessage(
	sock: WASocket,
	messageKey: WAMessageKey,
): Promise<proto.WebMessageInfo | undefined> {
	await sleep(1500);
	if (!messageKey.remoteJid) {
		throw new Error("Invalid message key");
	}
	return await sock.sendMessage(messageKey.remoteJid, { delete: messageKey });
}
