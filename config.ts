export interface BotSettings {
	markOnlineOnConnect: boolean;
	defaultConnectTimeout: number;
	keepAliveIntervalMs: number;
}

export interface Config {
	authFolder: string;
	isSpam: (text: string) => Promise<boolean> | boolean;
	botSettings: BotSettings;
}

export const config: Config = {
	authFolder: "auth_state",
	isSpam: (text: string) => {
		const URL_REGEX =
			/(?:(http|https)?:\/\/)?(?:[\w-]+\.)+([a-z]|[A-Z]|[0-9]){2,6}/gi;
		const spamWords = [/השקע(?:ה|ות)/i, /מני(?:ה|ות)/i];

		return spamWords.some((regex) => regex.test(text)) && URL_REGEX.test(text);
	},
	botSettings: {
		markOnlineOnConnect: true,
		defaultConnectTimeout: 20000,
		keepAliveIntervalMs: 10000,
	},
};
