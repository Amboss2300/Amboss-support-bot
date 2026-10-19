export default {
async fetch(request, env) {
const url = new URL(request.url);

if (url.pathname === "/setup") {
  if (!env.SETUP_KEY || url.searchParams.get("key") !== env.SETUP_KEY) {
    return new Response("Forbidden", { status: 403 });
  }

  const webhookUrl = `${url.origin}/webhook`;

  const result = await telegram(env, "setWebhook", {
    url: webhookUrl,
    secret_token: env.WEBHOOK_SECRET,
    allowed_updates: ["message", "callback_query"],
  });

  return Response.json(result);
}

if (url.pathname !== "/webhook" || request.method !== "POST") {
  return new Response("SAMHAROS Support Bot is running.");
}

if (
  !env.WEBHOOK_SECRET ||
  request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.WEBHOOK_SECRET
) {
  return new Response("Unauthorized", { status: 401 });
}

let update;

try {
  update = await request.json();
} catch {
  return new Response("Invalid JSON", { status: 400 });
}

try {
  if (update.callback_query) {
    await handleCallback(update.callback_query, env);
  } else if (update.message) {
    await handleMessage(update.message, env);
  }
} catch (error) {
  console.error("Bot error:", error);
}

return new Response("OK");

},
};

async function telegram(env, method, data) {
const response = await fetch(
"https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}",
{
method: "POST",
headers: { "Content-Type": "application/json" },
body: JSON.stringify(data),
}
);

const result = await response.json();

if (!result.ok) {
throw new Error("Telegram API error: ${result.description}");
}

return result.result;
}

async function sendText(env, chatId, text, extra = {}) {
return telegram(env, "sendMessage", {
chat_id: chatId,
text,
...extra,
});
}

async function handleMessage(message, env) {
const chatId = message.chat.id;
const senderId = message.from?.id;

if (!senderId || message.chat.type !== "private") return;

const isAdmin = String(senderId) === String(env.ADMIN_CHAT_ID);

if (message.text === "/start" && !isAdmin) {
await sendText(
env,
chatId,
"Welcome to SAMHAROS Support!\n\n" +
"Please send your question or describe the problem you encountered. " +
"Our support team will respond as soon as possible."
);
return;
}

if (message.text === "/start" && isAdmin) {
await sendText(env, chatId, "SAMHAROS Support Bot is ready.");
return;
}

if (isAdmin) {
const repliedMessage = message.reply_to_message;

if (repliedMessage?.from?.is_bot && repliedMessage.text) {
  const match = repliedMessage.text.match(
    /Reply to user ID:\s*(-?\d+)/
  );

  if (match && message.text && !message.text.startsWith("/")) {
    await sendText(
      env,
      chatId,
      "Sending your reply..."
    );

    try {
      await sendText(
        env,
        match[1],
        "📩 SAMHAROS Support:\n\n" + message.text
      );

      await sendText(env, chatId, "✅ Reply sent successfully.");
    } catch {
      await sendText(
        env,
        chatId,
        "❌ Failed to send the reply. The user may have blocked the bot."
      );
    }

    return;
  }
}

return;

}

if (message.text === "/start") return;

const name = [message.from.first_name, message.from.last_name]
.filter(Boolean)
.join(" ");

const username = message.from.username
? "@${message.from.username}"
: "Not available";

const description =
"📩 New SAMHAROS Support Message\n\n" +
"Name: ${name || "Unknown"}\n" +
"Username: ${username}\n" +
"User ID: ${chatId}";

const copied = await telegram(env, "copyMessage", {
chat_id: env.ADMIN_CHAT_ID,
from_chat_id: chatId,
message_id: message.message_id,
reply_markup: {
inline_keyboard: [
[
{
text: "↩️ Reply to User",
callback_data: "reply:${chatId}",
},
],
],
},
});

await sendText(env, env.ADMIN_CHAT_ID, description);
}

async function handleCallback(query, env) {
if (String(query.from.id) !== String(env.ADMIN_CHAT_ID)) {
await telegram(env, "answerCallbackQuery", {
callback_query_id: query.id,
text: "Unauthorized",
show_alert: true,
});
return;
}

const match = query.data?.match(/^reply:(-?\d+)$/);

if (!match) return;

const userId = match[1];

await telegram(env, "answerCallbackQuery", {
callback_query_id: query.id,
text: "Reply mode activated",
});

await sendText(
env,
env.ADMIN_CHAT_ID,
"✍️ Reply to user ID: ${userId}\n\n" +
"Now reply directly to THIS message with the text you want to send to the user."
);
}
