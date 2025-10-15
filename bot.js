
const TelegramBot = require('node-telegram-bot-api');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const { getKeyboard } = require('./menu');


// --- Startup Diagnostics ---

/**
 * Runs a series of checks to ensure the environment configuration is valid.
 * This provides clear feedback on what's wrong if the bot fails to start.
 * It supports both local .env files and injected environment variables on servers.
 * @returns {boolean} True if all critical checks pass, false otherwise.
 */
const runStartupDiagnostics = () => {
    console.log('--- Running Configuration Diagnostics ---');
    const envPath = path.join(__dirname, '.env');

    // On platforms like Render, .env isn't used. Variables are injected directly.
    // This check is now for providing helpful warnings during local development.
    if (fs.existsSync(envPath)) {
        console.log(`[DIAGNOSTIC] ✅ Found .env file at: ${envPath}`);
        try {
            const fileContent = fs.readFileSync(envPath, 'utf8');
            const lines = fileContent.split(/\r?\n/);
            lines.forEach((line) => {
                const trimmedLine = line.trim();
                if (trimmedLine && !trimmedLine.startsWith('#')) {
                    const parts = trimmedLine.split('=');
                    const key = parts[0].trim();
                    const valuePart = parts.slice(1).join('=').trim();
                    if (key === 'TELEGRAM_BOT_TOKEN' && (valuePart.endsWith('|') || valuePart.endsWith(' '))) {
                         console.warn(`\n[DIAGNOSTIC] 🟡 WARNING: A stray character (like '|' or a space) was detected at the end of your TELEGRAM_BOT_TOKEN in the .env file. This can break the configuration. Please remove it.\n`);
                    }
                }
            });
        } catch (e) {
            console.error(`\n[DIAGNOSTIC] ❌ ERROR: Could not read the .env file. Error: ${e.message}\n`);
            // This is not fatal, as variables might be set elsewhere.
        }
    } else {
        console.log('[DIAGNOSTIC] 🟡 INFO: .env file not found. Assuming environment variables are set directly (e.g., on a hosting platform like Render).');
    }

    // This will load variables from .env if it exists, and does nothing if it doesn't.
    dotenv.config();

    // Now, check if the variables are loaded into process.env, regardless of the source.
    const requiredVars = {
        'TELEGRAM_BOT_TOKEN': process.env.TELEGRAM_BOT_TOKEN,
        'ADMIN_USER_ID': process.env.ADMIN_USER_ID,
    };
     const optionalVars = {
        'REQUIRED_CHANNEL_ID': process.env.REQUIRED_CHANNEL_ID,
        'CHANNEL_INVITE_LINK': process.env.CHANNEL_INVITE_LINK
    };
    
    let criticalVarsMissing = false;
    console.log('[DIAGNOSTIC] --- Final Variable Check ---');
    
    for (const [key, value] of Object.entries(requiredVars)) {
         if (value) {
            console.log(`[DIAGNOSTIC] ✅ ${key} = Loaded Successfully.`);
        } else {
            console.error(`[DIAGNOSTIC] ❌ FATAL: Required variable ${key} = NOT FOUND.`);
            criticalVarsMissing = true;
        }
    }
    
    for (const [key, value] of Object.entries(optionalVars)) {
         if (value) {
            console.log(`[DIAGNOSTIC] ✅ ${key} = Loaded Successfully.`);
        } else {
            console.log(`[DIAGNOSTIC] 🟡 INFO: Optional variable ${key} = NOT FOUND.`);
        }
    }

    console.log('--- End of Diagnostics ---\n');

    return !criticalVarsMissing;
};


// --- Configuration & Initialization ---

if (!runStartupDiagnostics()) {
    console.error('FATAL ERROR: Bot cannot start due to missing critical environment variables (TELEGRAM_BOT_TOKEN or ADMIN_USER_ID). Please review the messages above.');
    process.exit(1);
}

// Display non-fatal warnings after diagnostics
if (!process.env.REQUIRED_CHANNEL_ID) {
    console.warn('Warning: REQUIRED_CHANNEL_ID is not set. The "force subscribe" feature is disabled.');
} else if (!process.env.CHANNEL_INVITE_LINK) {
    console.warn('Warning: REQUIRED_CHANNEL_ID is set, but CHANNEL_INVITE_LINK is not. The "Join Channel" button will not work correctly.');
}

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_IDS = process.env.ADMIN_USER_ID.split(',').map(id => parseInt(id.trim(), 10));
const REQUIRED_CHANNEL_ID = process.env.REQUIRED_CHANNEL_ID;
const CHANNEL_INVITE_LINK = process.env.CHANNEL_INVITE_LINK;

const bot = new TelegramBot(TOKEN, {
    polling: true,
    request: {
        agentOptions: {
            keepAlive: true,
            family: 4,
        },
    },
});


// --- Force Subscription Helpers ---

const checkUserMembership = async (userId) => {
    if (!REQUIRED_CHANNEL_ID) return true;
    try {
        const member = await bot.getChatMember(REQUIRED_CHANNEL_ID, userId);
        const validStatuses = ['member', 'administrator', 'creator'];
        return validStatuses.includes(member.status);
    } catch (error) {
        console.error(`Could not check membership for user ${userId} in channel ${REQUIRED_CHANNEL_ID}. Error: ${error.message}`);
        return false;
    }
};

const sendSubscriptionMessage = (chatId, messageId = null) => {
    const text = 'عذراً، يجب عليك الاشتراك في القناة أولاً لاستخدام البوت. 🤖\n\nاضغط على الزر أدناه للاشتراك، ثم اضغط على "تحقق من الاشتراك".';
    
    const joinButtonRow = CHANNEL_INVITE_LINK ? [[{ text: '📢 الانضمام إلى القناة', url: CHANNEL_INVITE_LINK }]] : [];
    
    const keyboard = {
        inline_keyboard: [
            ...joinButtonRow,
            [{ text: '🔄 تحقق من الاشتراك', callback_data: 'check_subscription' }]
        ]
    };

    const options = { chat_id: chatId, reply_markup: keyboard };

    if (messageId) {
        bot.editMessageText(text, { ...options, message_id: messageId }).catch(() => {
            bot.sendMessage(chatId, text, options).catch(e => console.error(`Failed to send subscription message: ${e.message}`));
        });
    } else {
        bot.sendMessage(chatId, text, options).catch(e => console.error(`Failed to send subscription message: ${e.message}`));
    }
};


// --- Database Management ---

const FILES_DB_PATH = path.join(__dirname, 'files.json');
const USER_STATES_PATH = path.join(__dirname, 'user_states.json');

const loadDB = (filePath) => {
    try {
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error(`Error loading database at ${filePath}:`, error);
    }
    return {};
};

const saveDB = (filePath, data) => {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
        console.error(`Error saving database at ${filePath}:`, error);
    }
};

let filesDB = loadDB(FILES_DB_PATH);
let userState = loadDB(USER_STATES_PATH);

const getFilesForPath = (pathKey) => {
    return filesDB[pathKey] || [];
};


// --- Bot Logic Helpers ---

const isAdmin = (userId) => ADMIN_IDS.includes(userId);

const updateUserMenu = async (chatId, userId) => {
    const currentState = userState[userId] || { path: 'initial', mid: null };
    const { text, keyboard, parse_mode } = getKeyboard(currentState.path, userId, isAdmin(userId), filesDB, userState);

    const options = {
        chat_id: chatId,
        message_id: currentState.mid,
        reply_markup: { inline_keyboard: keyboard },
        parse_mode: parse_mode || 'Markdown' // Default to Markdown, but allow override
    };

    try {
        if (currentState.mid) {
            await bot.editMessageText(text, options);
        } else {
            throw new Error("No message ID to edit, sending new message.");
        }
    } catch (error) {
        try {
            if (currentState.mid) {
                await bot.deleteMessage(chatId, currentState.mid).catch(() => {});
            }
            const sentMessage = await bot.sendMessage(chatId, text, {
                reply_markup: { inline_keyboard: keyboard },
                parse_mode: parse_mode || 'Markdown'
            });
            userState[userId] = { ...currentState, mid: sentMessage.message_id };
            saveDB(USER_STATES_PATH, userState);
        } catch (sendError) {
             console.error("Fatal Error: Could not send new message:", sendError.response ? sendError.response.body : sendError.message);
        }
    }
};


// --- Bot Event Handlers ---

bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    const isMember = await checkUserMembership(userId);
    if (!isMember) {
        sendSubscriptionMessage(chatId);
        return;
    }

    console.log(`User ${userId} started the bot.`);
    userState[userId] = { path: 'initial', mid: null };
    updateUserMenu(chatId, userId);
});

bot.on('callback_query', async (query) => {
    const userId = query.from.id;
    const chatId = query.message.chat.id;
    const data = query.data;

    const isMember = await checkUserMembership(userId);

    if (data === 'check_subscription') {
        if (isMember) {
            await bot.answerCallbackQuery(query.id, { text: 'شكراً لانضمامك! مرحباً بك.' });
            userState[userId] = { path: 'initial', mid: query.message.message_id };
            await updateUserMenu(chatId, userId);
        } else {
            await bot.answerCallbackQuery(query.id, { text: 'لم تنضم إلى القناة بعد. يرجى الانضمام أولاً.', show_alert: true });
        }
        return;
    }

    if (!isMember) {
        await bot.answerCallbackQuery(query.id);
        sendSubscriptionMessage(chatId, query.message.message_id);
        return;
    }
    
    await bot.answerCallbackQuery(query.id).catch(err => console.error("Error answering callback query:", err.message));

    let currentState = userState[userId];
    if (!currentState) {
        await bot.sendMessage(chatId, 'حدث خطأ ما. يرجى الضغط على /start للبدء من جديد.');
        return;
    }
    
    const oldPath = currentState.path;
    const [command, payload] = data.split('::');
    let needsMenuUpdate = true;
    const currentPath = oldPath.replace(/:awaiting_files_bulk|:delete_mode/g, '');

    if (command === 'DOWNLOAD') {
        const fileIndex = parseInt(payload, 10);
        const files = getFilesForPath(currentPath);
        if (files[fileIndex]) {
            await bot.sendDocument(chatId, files[fileIndex].file_id).catch(err => console.error("Error sending document:", err.message));
        }
        needsMenuUpdate = false;
    } else if (data.startsWith('MARK_DELETE::') && isAdmin(userId)) {
        const fileIndex = parseInt(data.split('::')[1], 10);
        if (!currentState.pendingDeletions) currentState.pendingDeletions = [];
        if (!currentState.pendingDeletions.includes(fileIndex)) {
            currentState.pendingDeletions.push(fileIndex);
        }
    } else if (data.startsWith('UNDOMARK_DELETE::') && isAdmin(userId)) {
        const fileIndex = parseInt(data.split('::')[1], 10);
        if (currentState.pendingDeletions) {
            currentState.pendingDeletions = currentState.pendingDeletions.filter(i => i !== fileIndex);
        }
    } else if (data === 'CONFIRM_DELETE' && isAdmin(userId)) {
        const files = getFilesForPath(currentPath);
        const pendingDeletions = currentState.pendingDeletions || [];
        if (pendingDeletions.length > 0) {
            const updatedFiles = files.filter((_, index) => !pendingDeletions.includes(index));
            filesDB[currentPath] = updatedFiles;
            saveDB(FILES_DB_PATH, filesDB);
            await bot.answerCallbackQuery(query.id, { text: `تم حذف ${pendingDeletions.length} ملفات بنجاح.` });
        } else {
            await bot.answerCallbackQuery(query.id, { text: 'لم يتم تحديد أي ملفات للحذف.' });
        }
        delete currentState.pendingDeletions;
        currentState.path = currentPath;
    } else if (data === 'add_file_prompt' && isAdmin(userId)) {
        currentState.path = `${currentPath}:awaiting_files_bulk`;
    } else if (data === 'delete_file_prompt' && isAdmin(userId)) {
        currentState.pendingDeletions = []; // Reset pending list on entry
        currentState.path = `${currentPath}:delete_mode`;
    } else if (data === 'cancel_delete' && isAdmin(userId)) {
        delete currentState.pendingDeletions;
        currentState.path = currentPath;
    } else if (data === 'finish_bulk_upload' && isAdmin(userId)) {
        await bot.sendMessage(chatId, 'تم حفظ جميع الملفات بنجاح! ✅').catch(err => console.error(err.message));
        currentState.path = currentPath;
    } else {
        if (data === 'back') {
            const pathParts = currentPath.split(':');
            if (pathParts.length > 1) {
                currentState.path = pathParts.slice(0, -1).join(':');
            }
        } else if (data === 'initial') {
            currentState.path = 'initial';
        } else {
            currentState.path = data.startsWith('initial:') ? data : `${currentPath}:${data}`;
        }
    }

    console.log(`User ${userId} clicked button with data: "${data}" from path: "${oldPath}"`);
    
    userState[userId] = currentState;
    saveDB(USER_STATES_PATH, userState);
    
    if (needsMenuUpdate) {
        await updateUserMenu(chatId, userId);
    }
});

bot.on('document', async (msg) => {
    const userId = msg.from.id;
    const chatId = msg.chat.id;
    
    const currentState = userState[userId];
    if (!isAdmin(userId) || !currentState || !currentState.path.endsWith(':awaiting_files_bulk')) {
        return;
    }

    const pathKey = currentState.path.replace(':awaiting_files_bulk', '');

    if (!Array.isArray(filesDB[pathKey])) {
        filesDB[pathKey] = [];
    }
    
    filesDB[pathKey].push({
        file_id: msg.document.file_id,
        file_name: msg.document.file_name,
    });
    
    saveDB(FILES_DB_PATH, filesDB);
    
    await bot.sendMessage(chatId, `✅ تم حفظ: ${msg.document.file_name}`, {
        disable_notification: true,
    }).catch(err => console.error("Error sending file confirmation:", err.message));

    console.log(`Admin ${userId} uploaded file "${msg.document.file_name}" to path ${pathKey}`);
});


// --- Robust Error Handling ---

bot.on('polling_error', (error) => {
  console.error(`[Polling Error] ${new Date().toISOString()}: ${error.code} - ${error.message}`);
});

bot.on('webhook_error', (error) => {
  console.error(`[Webhook Error] ${new Date().toISOString()}: ${error.code} - ${error.message}`);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(`[Unhandled Rejection] ${new Date().toISOString()}:`, reason);
});

process.on('uncaughtException', (error) => {
  console.error(`[Uncaught Exception] ${new Date().toISOString()}:`, error);
});


console.log('Educational Library Bot is running...');
