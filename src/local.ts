import { createAPIClient } from './api';
import { createBotServer } from './bot';
import { ProxyAgent, setGlobalDispatcher } from 'undici';

const {
	HTTPS_PROXY,
	TELEGRAM_BOT_TOKEN
} = process.env;

if (HTTPS_PROXY) {
	setGlobalDispatcher(new ProxyAgent(HTTPS_PROXY));
}

async function main() {
	const client = createAPIClient(TELEGRAM_BOT_TOKEN);
	const botServer = createBotServer(client)
	const {result: user} = await client.getMeWithReturns();
	console.log(`Hello! My name is ${user.username}`);
	await client.deleteWebhook();
	let offset = 0
	while (true) {
		const {result: updates} = await client.getUpdatesWithReturns({offset: offset});
		for (const update of updates) {
			offset = update.update_id + 1;
			await botServer.fetch(update);
		}
	}
}
main().catch(console.error);
