# Wall Chain Raffle Bot

## Overview
The Wall Chain Raffle Bot is a Telegram bot designed to manage a raffle event, allowing users to participate by registering their Twitter usernames and view raffle-related information. The bot is developed in Node.js using the `node-telegram-bot-api` library and ensures a fair and secure random selection of winners. This document provides an overview of the code's functionality and technical details, particularly emphasizing the randomization process.

## Features
- **User Interaction**: Users initiate interaction with the `/start` command, receiving a welcome message and an inline keyboard with four options:
  - **Time Left Until Raffle Ends**: Displays the remaining time until the raffle concludes (set for June 5, 2025, 10:00 PM Iran time).
  - **Raffle Results**: Shows the list of winners after the raffle ends or a message if the raffle is ongoing.
  - **Join Raffle**: Allows users to register their Twitter username (one-time registration per user).
  - **Participant Count**: Reports the total number of users who started the bot and those who joined the raffle.
- **Welcome Message**: Includes a custom message indicating the bot is created by the Persian community, with a "Persian Golf" signature.
- **Winner Selection**: After the raffle ends, 50 winners are selected randomly and stored persistently to ensure consistency across requests.
- **Message Management**: Deletes previous messages to maintain a clean user interface, ensuring each user sees only their latest interaction.
- **Concurrency Handling**: Manages concurrent data writes to prevent race conditions.
- **Error Handling**: Robustly handles Telegram API errors (e.g., rate limits) to ensure the bot remains operational.

## Code Structure
The bot is implemented in a single file, `telegram_bot.js`, with the following key components:

- **Initialization**:
  - Uses `node-telegram-bot-api` for Telegram interactions and `fs` for file-based data storage.
  - Defines the raffle end date (June 5, 2025, 10:00 PM Iran time).
  - Loads and initializes persistent data from `raffle_data.json`.

- **Data Storage**:
  - Stores data in `raffle_data.json` with the following structure:
    ```json
    {
      "participants": { "userId": { "username": string, "twitter": string } },
      "totalStarts": number,
      "lastMessageIds": { "userId": number },
      "winners": { "timestamp": number, "list": string[] } | null
    }
    ```
  - Manages concurrent writes using a locking mechanism (`isWriting` and `writeQueue`).

- **Message Handling**:
  - Deletes previous user messages before sending new ones to keep the chat clean.
  - Tracks the last message ID per user in `lastMessageIds`.

- **Command and Callback Handlers**:
  - Handles `/start` to display the welcome message and menu.
  - Processes inline button clicks (`time_left`, `raffle_result`, `join_raffle`, `participant_count`) with appropriate responses.
  - Manages Twitter username input via reply messages, ensuring one-time registration.

- **Error Management**:
  - Handles Telegram API errors, including rate limits (HTTP 429) with retry logic.
  - Ignores harmless errors (e.g., attempting to delete non-existent messages).

## Randomization Process
The bot ensures a fair and secure winner selection process with the following approach:

- **Trigger**: Winners are selected the first time the "Raffle Results" button is pressed after the raffle end date.
- **Algorithm**:
  - Uses the Fisher-Yates Shuffle algorithm to randomize the participant list.
  - Generates cryptographically secure random numbers with `crypto.randomBytes` to determine swap indices, ensuring unpredictability.
  - Selects the first 50 participants (or fewer if fewer exist) from the shuffled list.
- **Persistence**:
  - The selected winners are stored in `raffle_data.json` under the `winners` key with a timestamp and the list of Twitter usernames.
  - Subsequent requests for raffle results retrieve the stored winners, ensuring consistency.
- **Security**:
  - The use of `crypto.randomBytes` provides a cryptographically secure randomization, suitable for high-stakes raffles.
  - The one-time selection and storage prevent manipulation or re-randomization.

## Technical Details
- **Language**: Node.js (JavaScript).
- **Dependencies**: `node-telegram-bot-api`, `fs`, `util`, `crypto`.
- **Data Persistence**: File-based (`raffle_data.json`), suitable for small-scale use. For production, a database like MongoDB or Redis is recommended.
- **Concurrency**: Managed with a simple locking mechanism to handle simultaneous writes.
- **Error Handling**: Comprehensive, covering file I/O, Telegram API, and user input errors.

## Notes
- The bot is designed to be user-friendly, with a clean interface achieved by deleting previous messages.
- The randomization process is secure and transparent, with winners fixed after the initial selection.
- The code is optimized for reliability, handling high user loads with robust error management.
- For production deployment, consider replacing file-based storage with a database and adding admin commands for winner access.

This bot serves as a reliable and fair raffle management tool, with a strong emphasis on secure randomization and user experience.
