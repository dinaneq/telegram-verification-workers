import type * as Telegram from 'telegram-bot-api-types';
import type { APIClient } from './api';
import { MatchType, TelegramRouter } from 'telegram-router';

function renderUsername(user: Telegram.User): string {
    let name = '';
    if (user.first_name) {
        name += user.first_name;
    }
    if (user.last_name) {
        name += ` ${user.last_name}`;
    }
    if (user.username) {
        name += ` (@${user.username})`;
    }
    return name;
}

async function handleNewChatMember(u: Telegram.Update, client: APIClient) {
    const chatId = u.message?.chat.id;
    if (!chatId) {
        return;
    }
    for (const member of u.message?.new_chat_members || []) {
        const { question, buttons } = generateQuestion(member);
        await client.sendMessage({
            chat_id: chatId,
            text: question,
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

async function handleAnswerCallBackQuery(u: Telegram.Update, client: APIClient) {
    const [_, userId] = u.callback_query.data.split(':');
    if (userId === u.callback_query.from.id.toString()) {
        if (isCorrectAnswer(u.callback_query.data)) {
            const name = renderUsername(u.callback_query.from);
            await client.editMessageText({
                chat_id: u.callback_query.message.chat.id,
                message_id: u.callback_query.message.message_id,
                text: `Congratulations ${name}! You have been unbanned!`,
                reply_markup: {
                    inline_keyboard: [
                        [{
                            text: 'OK!',
                            callback_data: `del:${u.callback_query.from.id}`,
                        }],
                    ],
                },
            });
            await unbanUser(client, u.callback_query.message.chat.id, u.callback_query.from.id);
        } else {
            const { question, buttons } = generateQuestion(u.callback_query.from);
            await client.editMessageText({
                chat_id: u.callback_query.message.chat.id,
                message_id: u.callback_query.message.message_id,
                text: question,
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

async function handleDeleteSuccessMessage(u: Telegram.Update, client: APIClient) {
    const [_, id] = u.callback_query.data.split(':');
    if (id === u.callback_query.from.id.toString()) {
        await client.deleteMessage({
            chat_id: u.callback_query.message.chat.id,
            message_id: u.callback_query.message.message_id,
        });
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
    bot.handleCallback('an:', MatchType.Prefix, async (u: Telegram.Update): Promise<Response> => {
        await handleAnswerCallBackQuery(u, client);
        return new Response('success', { status: 200 });
    });
    bot.handleCallback('del:', MatchType.Prefix, async (u: Telegram.Update): Promise<Response> => {
        await handleDeleteSuccessMessage(u, client);
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
    const [_, __, a, operator, b, answer] = callback_data.split(':');
    return calculateOperation(operator as QuestionOperator, [Number.parseInt(a), Number.parseInt(b)]) === Number.parseInt(answer);
}

function generateQuestion(user: Telegram.User): { parse_mode?: Telegram.ParseMode; question: string; buttons: Telegram.InlineKeyboardButton[] } {
    const { operator, operands } = generateOperation();
    const answer = calculateOperation(operator, operands);
    const question = `Answer the following question to be unbanned\n${operands[0]} ${operator} ${operands[1]} = ?`;
    const buttons: Telegram.InlineKeyboardButton[] = [];
    let offsets = [1,2,3,4,5,-1,-2,-3,-4,-5]
			.sort(() => Math.random() - 0.5)
			.slice(0, 3);
		offsets.push(0);
		offsets = offsets.sort(() => Math.random() - 0.5);
    for (const offset of offsets) {
        buttons.push({
            text: `${answer + offset}`,
            callback_data: `an:${user.id}:${operands[0]}:${operator}:${operands[1]}:${answer + offset}`,
        });
    }
    return { question, buttons };
}
