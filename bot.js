const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const { promisify } = require('util');
const crypto = require('crypto');

// Replace with your Telegram bot token
const token = 'YOUR_BOT_TOKEN';
const bot = new TelegramBot(token, { polling: true });

// Raffle end date: Wednesday, June 5, 2025, 10:00 PM Iran time
const raffleEndDate = new Date('2025-06-05T22:00:00+03:30');

// JSON file for data storage
const dataFile = './raffle_data.json';

// Lock for concurrency management
let isWriting = false;
const writeQueue = [];
const writeFileAsync = promisify(fs.writeFile);

// Initial data structure
let raffleData = {
  participants: {}, // { userId: { username: string, twitter: string } }
  totalStarts: 0,
  lastMessageIds: {}, // { userId: messageId }
  winners: null // { timestamp: number, list: string[] } or null
};

// Load data from JSON file
try {
  if (fs.existsSync(dataFile)) {
    raffleData = JSON.parse(fs.readFileSync(dataFile));
    if (!raffleData.lastMessageIds) {
      raffleData.lastMessageIds = {};
    }
    if (!raffleData.winners) {
      raffleData.winners = null;
    }
  }
} catch (error) {
  console.error('Error loading data:', error);
  raffleData = { participants: {}, totalStarts: 0, lastMessageIds: {}, winners: null };
}

// Save data with concurrency management
async function saveData() {
  if (isWriting) {
    return new Promise((resolve) => writeQueue.push(resolve));
  }
  isWriting = true;
  try {
    await writeFileAsync(dataFile, JSON.stringify(raffleData, null, 2));
    isWriting = false;
    while (writeQueue.length > 0) {
      writeQueue.shift()();
    }
  } catch (error) {
    console.error('Error saving data:', error);
    isWriting = false;
  }
}

// Delete user's previous message
async function deletePreviousMessage(chatId, userId) {
  try {
    const messageId = raffleData.lastMessageIds[userId];
    if (messageId) {
      await bot.deleteMessage(chatId, messageId);
    }
  } catch (error) {
    if (error.response && error.response.body.description.includes('message to delete not found')) {
      return;
    }
    console.error('Error deleting message:', error);
  }
}

// Update last message ID
async function updateLastMessageId(userId, messageId) {
  raffleData.lastMessageIds[userId] = messageId;
  await saveData();
}

// Select winners securely
async function selectWinners() {
  const participants = Object.keys(raffleData.participants);
  if (participants.length === 0) {
    return [];
  }
  const shuffled = participants.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const randomBytes = crypto.randomBytes(4);
    const j = randomBytes.readUInt32LE(0) % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const winners = shuffled.slice(0, Math.min(50, participants.length));
  return winners.map(id => raffleData.participants[id].twitter);
}

// Main menu with inline buttons
const mainMenu = {
  reply_markup: {
    inline_keyboard: [
      [{ text: 'Time Left Until Raffle Ends', callback_data: 'time_left' }],
      [{ text: 'Raffle Results', callback_data: 'raffle_result' }],
      [{ text: 'Join Raffle', callback_data: 'join_raffle' }],
      [{ text: 'Participant Count', callback_data: 'participant_count' }]
    ]
  }
};

// Handle /start command
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();

  await deletePreviousMessage(chatId, userId);
  raffleData.totalStarts += 1;

  try {
    const sentMessage = await bot.sendMessage(
      chatId,
      'Welcome to the Wall Chain Raffle Code Bot!\n' +
      'This bot is created by the Persian community.\n' +
      'Persian Golf\n' +
      'Please select an option:',
      mainMenu
    );
    await updateLastMessageId(userId, sentMessage.message_id);
  } catch (error) {
    console.error('Error sending start message:', error);
    await handleTelegramError(chatId, error);
  }
});

// Handle button clicks
bot.on('callback_query', async (callbackQuery) => {
  const msg = callbackQuery.message;
  const data = callbackQuery.data;
  const chatId = msg.chat.id;
  const userId = callbackQuery.from.id.toString();

  await deletePreviousMessage(chatId, userId);

  try {
    if (data === 'time_left') {
      const now = new Date();
      const diffMs = raffleEndDate - now;

      let text;
      if (diffMs > 0) {
        const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        text = `Time left until raffle ends:\n${days} days, ${hours} hours, and ${minutes} minutes`;
      } else {
        text = 'The raffle has ended!';
      }
      const sentMessage = await bot.sendMessage(chatId, text, mainMenu);
      await updateLastMessageId(userId, sentMessage.message_id);
    }

    if (data === 'raffle_result') {
      const now = new Date();
      let text;
      if (now < raffleEndDate) {
        text = 'The raffle has not yet ended!';
      } else {
        if (raffleData.winners) {
          // Use stored winners
          text = `Raffle winners:\n${raffleData.winners.list.join('\n')}`;
        } else {
          const participants = Object.keys(raffleData.participants);
          if (participants.length === 0) {
            text = 'No participants yet!';
          } else {
            // Select and store winners
            const winnerList = await selectWinners();
            raffleData.winners = {
              timestamp: Date.now(),
              list: winnerList
            };
            await saveData();
            text = `Raffle winners:\n${winnerList.join('\n')}`;
          }
        }
      }
      const sentMessage = await bot.sendMessage(chatId, text, mainMenu);
      await updateLastMessageId(userId, sentMessage.message_id);
    }

    if (data === 'join_raffle') {
      if (raffleData.participants[userId]) {
        const sentMessage = await bot.sendMessage(
          chatId,
          `You have already joined the raffle with Twitter username: @${raffleData.participants[userId].twitter}`,
          mainMenu
        );
        await updateLastMessageId(userId, sentMessage.message_id);
      } else {
        const sentMessage = await bot.sendMessage(
          chatId,
          'Please enter your Twitter username without @:',
          { reply_markup: { force_reply: true } }
        );
        await updateLastMessageId(userId, sentMessage.message_id);
      }
    }

    if (data === 'participant_count') {
      const registeredCount = Object.keys(raffleData.participants).length;
      const text =
        `Total users who started the bot: ${raffleData.totalStarts}\n` +
        `Users who joined the raffle: ${registeredCount}`;
      const sentMessage = await bot.sendMessage(chatId, text, mainMenu);
      await updateLastMessageId(userId, sentMessage.message_id);
    }

    await bot.answerCallbackQuery(callbackQuery.id);
  } catch (error) {
    console.error('Error handling callback:', error);
    await handleTelegramError(chatId, error);
  }
});

// Handle Twitter username input
bot.on('message', async (msg) => {
  if (msg.reply_to_message && msg.reply_to_message.text.includes('Twitter username')) {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    const twitterUsername = msg.text.trim();

    await deletePreviousMessage(chatId, userId);

    try {
      if (!twitterUsername) {
        const sentMessage = await bot.sendMessage(chatId, 'Twitter username cannot be empty!', mainMenu);
        await updateLastMessageId(userId, sentMessage.message_id);
        return;
      }

      if (raffleData.participants[userId]) {
        const sentMessage = await bot.sendMessage(
          chatId,
          `You have already registered with Twitter username: @${raffleData.participants[userId].twitter}`,
          mainMenu
        );
        await updateLastMessageId(userId, sentMessage.message_id);
      } else {
        raffleData.participants[userId] = {
          username: msg.from.username || msg.from.first_name,
          twitter: twitterUsername
        };
        await saveData();
        const sentMessage = await bot.sendMessage(
          chatId,
          `You have successfully joined the raffle with Twitter username: @${twitterUsername}`,
          mainMenu
        );
        await updateLastMessageId(userId, sentMessage.message_id);
      }
    } catch (error) {
      console.error('Error handling Twitter username:', error);
      await handleTelegramError(chatId, error);
    }
  }
});

// Handle Telegram errors
async function handleTelegramError(chatId, error) {
  try {
    if (error.response && error.response.body) {
      const { error_code, description } = error.response.body;
      if (error_code === 429) {
        const retryAfter = error.response.body.parameters.retry_after || 5;
        console.warn(`Rate limit hit, retrying after ${retryAfter} seconds`);
        await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
        const sentMessage = await bot.sendMessage(chatId, 'Please try again shortly.', mainMenu);
        await updateLastMessageId(chatId.toString(), sentMessage.message_id);
        return;
      }
      if (description.includes('message to delete not found') || description.includes('message is not modified')) {
        return;
      }
    }
    const sentMessage = await bot.sendMessage(chatId, 'An error occurred. Please try again.', mainMenu);
    await updateLastMessageId(chatId.toString(), sentMessage.message_id);
  } catch (fallbackError) {
    console.error('Error in handleTelegramError:', fallbackError);
  }
}

// Handle polling errors
bot.on('polling_error', (error) => {
  console.error('Polling error:', error);
  if (error.response && error.response.body.error_code === 429) {
    const retryAfter = error.response.body.parameters.retry_after || 5;
    console.warn(`Polling rate limit, pausing for ${retryAfter} seconds`);
    setTimeout(() => {}, retryAfter * 1000);
  }
});

console.log('Bot is running...');
