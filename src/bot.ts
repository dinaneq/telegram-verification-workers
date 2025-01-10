import type * as Telegram from 'telegram-bot-api-types';
import type { APIClient } from './api';
import { TelegramRouter } from 'telegram-router';

function renderUsername(user: Telegram.User): { parse_mode?: Telegram.ParseMode, text: string } {
    let name = '';
    if (user.first_name) {
        name += user.first_name;
    }
    if (user.last_name) {
        name += ` ${user.last_name}`;
    }
    if (user.username) {
        name += ` (@${user.username})`;
				return { text: name };
    } else {
			return { parse_mode: 'Markdown', text: `[${escapeMarkdown(name)}](tg://user?id=${user.id})` };
		}
}

function escapeMarkdown(text: string): string {
	const escapeChars = ['_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!'];
	let escapedText = text;
	escapeChars.forEach(char => {
		const regex = new RegExp(`\\${char}`, 'g');
		escapedText = escapedText.replace(regex, `\\${char}`);
	});
	return escapedText;
}

async function handleNewChatMember(u: Telegram.Update, client: APIClient) {
    const chatId = u.message?.chat.id;
    if (!chatId) {
        return;
    }
    for (const member of u.message?.new_chat_members || []) {
        const { parse_mode, question, buttons } = generateQuestion(member);
        await client.sendMessage({
            chat_id: chatId,
            text: question,
						parse_mode,
            reply_parameters: {
                message_id: u.message.message_id,
                chat_id: chatId,
                allow_sending_without_reply: true,
            },
            reply_markup: {
                inline_keyboard: [buttons],
            },
        });
        const response = await banUser(client, chatId, member.id);
				console.log(await response.json());
    }
}

async function handleCallBackQuery(u: Telegram.Update, client: APIClient) {
    const callback_query = u.callback_query.data;
    if (!callback_query) {
        return;
    }
    const [userId] = callback_query.split(':');
    if (userId === u.callback_query.from.id.toString()) {
        if (isCorrectAnswer(callback_query)) {
						const { parse_mode, text } = renderUsername(u.callback_query.from);
            await client.editMessageText({
                chat_id: u.callback_query.message.chat.id,
                message_id: u.callback_query.message.message_id,
							  parse_mode,
                text: `Congratulations ${text}! You have been unbanned!`,
            });
            await unbanUser(client, u.callback_query.message.chat.id, u.callback_query.from.id);
        } else {
            const { parse_mode, question, buttons } = generateQuestion(u.callback_query.from);
            await client.editMessageText({
                chat_id: u.callback_query.message.chat.id,
                message_id: u.callback_query.message.message_id,
                text: question,
								parse_mode,
                reply_markup: {
                    inline_keyboard: [buttons],
                },
            });
            await client.answerCallbackQuery({
                callback_query_id: u.callback_query.id,
                text: 'Wrong answer! Try again!',
            });
        }
    }
}

export function createBotServer(client: APIClient): TelegramRouter<Response> {
    const bot = new TelegramRouter<Response>();
    // bot.with((update) => {
    //     console.log(JSON.stringify(update));
    // });

    bot.handle((u: Telegram.Update): boolean => {
        const length = u.message?.new_chat_members?.length;
        return length && length > 0;
    }, async (u: Telegram.Update): Promise<Response> => {
        await handleNewChatMember(u, client);
        return new Response('success', { status: 200 });
    });

    bot.handle((u: Telegram.Update): boolean => {
        return u.callback_query !== undefined;
    }, async (u: Telegram.Update): Promise<Response> => {
        await handleCallBackQuery(u, client);
        return new Response('success', { status: 200 });
    });
    bot.handle(() => true, async () => new Response('success', { status: 200 }));
    return bot;
}

function banUser(client: APIClient, chatId: number, userId: number): Promise<Response> {
    return client.restrictChatMember({
        chat_id: chatId,
        user_id: userId,
        permissions: {
            can_send_messages: false,
            can_send_photos: false,
            can_send_videos: false,
            can_send_audios: false,
            can_send_documents: false,
            can_send_other_messages: false,
            can_send_voice_notes: false,
            can_send_video_notes: false,
            can_send_polls: false,
        },
        use_independent_chat_permissions: true,
    });
}

function unbanUser(client: APIClient, chatId: number, userId: number): Promise<Response> {
    return client.restrictChatMember({
        chat_id: chatId,
        user_id: userId,
        permissions: {
            can_send_messages: true,
            can_send_photos: true,
            can_send_videos: true,
            can_send_audios: true,
            can_send_documents: true,
            can_send_other_messages: true,
            can_send_voice_notes: true,
            can_send_video_notes: true,
            can_send_polls: true,
        },
        use_independent_chat_permissions: true,
    });
}

type QuestionOperator = `+` | `-` | `*`;

function generateOperation(): { operator: QuestionOperator; operands: [number, number] } {
    const operands = [
        Math.floor(Math.random() * 100) + 1,
        Math.floor(Math.random() * 100) + 1,
    ] as [number, number];
    const operator = ['+', '-', '*'][Math.floor(Math.random() * 3)] as QuestionOperator;
    return { operator, operands };
}

function calculateOperation(operator: QuestionOperator, operands: [number, number]): number {
    const [a, b] = operands;
    switch (operator) {
        case '+':
            return a + b;
        case '-':
            return a - b;
        case '*':
            return a * b;
    }
}

function isCorrectAnswer(callback_data: string): boolean {
    const [_, a, operator, b, answer] = callback_data.split(':');
    return calculateOperation(operator as QuestionOperator, [Number.parseInt(a), Number.parseInt(b)]) === Number.parseInt(answer);
}

function generateQuestion(user: Telegram.User): {parse_mode?: Telegram.ParseMode,  question: string; buttons: Telegram.InlineKeyboardButton[] } {
    const { operator, operands } = generateOperation();
    const answer = calculateOperation(operator, operands);
		const { parse_mode, text } = renderUsername(user);
		const question = `Hello ${text}\nAnswer the following question to be unbanned\n${operands[0]} ${operator} ${operands[1]} = ?`;
    const buttons: Telegram.InlineKeyboardButton[] = [];
    let randOffset = Math.floor(Math.random() * 10) + 1;
    randOffset = randOffset === 0 ? 1 : randOffset;
    const offsets = [0, randOffset, randOffset - 1, randOffset + 1].sort(() => Math.random() - 0.5);
    for (const offset of offsets) {
        buttons.push({
            text: `${answer + offset}`,
            callback_data: `${user.id}:${operands[0]}:${operator}:${operands[1]}:${answer + offset}`,
        });
    }
    return { parse_mode, question, buttons };
}
