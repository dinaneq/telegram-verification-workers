import type * as Telegram from 'telegram-bot-api-types';
import type { APIClient } from './api';
import { TelegramRouter } from 'telegram-router';

export function createBotServer(client: APIClient): TelegramRouter<Response> {
    const bot = new TelegramRouter<Response>();
    bot.with((update) => {
        console.log(JSON.stringify(update));
    });

    bot.handle((u: Telegram.Update): boolean => {
        const length = u.message?.new_chat_members?.length;
        return length && length > 0;
    }, async (u: Telegram.Update): Promise<Response> => {
        const chatId = u.message?.chat.id;
        if (chatId) {
            for (const member of u.message?.new_chat_members || []) {
                await restrictUser(client, chatId, member.id);
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
            }
        }
        return new Response('success', { status: 200 });
    });

    bot.handle((u: Telegram.Update): boolean => {
        return u.callback_query !== undefined;
    }, async (u: Telegram.Update): Promise<Response> => {
        const callback_query = u.callback_query.data;
        if (callback_query) {
            const [userId] = callback_query.split(':');
            if (userId === u.callback_query.from.id.toString()) {
                if (isCorrectAnswer(callback_query)) {
                    await client.editMessageText({
                        chat_id: u.callback_query.message.chat.id,
                        message_id: u.callback_query.message.message_id,
                        text: `Correct! Well done, ${u.callback_query.from.first_name} ${u.callback_query.from.last_name}!`,
                    });
                    await allowUserSendMessage(client, u.callback_query.message.chat.id, u.callback_query.from.id);
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
        return new Response('success', { status: 200 });
    });
    return bot;
}

function restrictUser(client: APIClient, chatId: number, userId: number): Promise<Response> {
    return client.restrictChatMember({
        chat_id: chatId,
        user_id: userId,
        permissions: {
            can_send_messages: false,
            can_send_audios: false,
            can_send_documents: false,
            can_send_photos: false,
            can_send_videos: false,
            can_send_video_notes: false,
            can_send_voice_notes: false,
            can_send_polls: false,
            can_send_other_messages: false,
            can_add_web_page_previews: false,
            can_change_info: false,
            can_invite_users: false,
            can_pin_messages: false,
            can_manage_topics: false,
        },
    });
}

function allowUserSendMessage(client: APIClient, chatId: number, userId: number): Promise<Response> {
    return client.restrictChatMember({
        chat_id: chatId,
        user_id: userId,
        permissions: {
            can_send_messages: true,
            can_send_audios: true,
            can_send_documents: true,
            can_send_photos: true,
            can_send_videos: true,
            can_send_video_notes: true,
            can_send_voice_notes: true,
            can_send_polls: true,
            can_send_other_messages: true,
        },
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

function generateQuestion(user: Telegram.User): { question: string; buttons: Telegram.InlineKeyboardButton[] } {
    const { operator, operands } = generateOperation();
    const answer = calculateOperation(operator, operands);
    const question = `${user.first_name} ${user.last_name}, what is ${operands[0]} ${operator} ${operands[1]}?`;
    const buttons: Telegram.InlineKeyboardButton[] = [];
    const randOffset = Math.floor(Math.random() * 10) + 1;
    const offsets = [0, randOffset, randOffset - 1, randOffset + 1].sort(() => Math.random() - 0.5);
    for (const offset of offsets) {
        buttons.push({
            text: `${answer + offset}`,
            callback_data: `${user.id}:${operands[0]}:${operator}:${operands[1]}:${answer + offset}`,
        });
    }
    return { question, buttons };
}
