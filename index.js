import "dotenv/config";
import { Telegraf } from "telegraf";
import { readFileSync, writeFileSync } from "fs";

// --- Config ---
const { BOT_TOKEN, GROUP_A_ID, GROUP_B_ID, OWNER_ID, ALLOWED_SENDER_IDS } =
  process.env;

if (
  !BOT_TOKEN ||
  !GROUP_A_ID ||
  !GROUP_B_ID ||
  !OWNER_ID ||
  !ALLOWED_SENDER_IDS
) {
  console.error(
    "Missing required env vars. Copy .env.example to .env and fill it in.",
  );
  process.exit(1);
}

const groupA = Number(GROUP_A_ID);
const groupB = Number(GROUP_B_ID);
const ownerId = Number(OWNER_ID);
const allowedSenders = new Set(
  ALLOWED_SENDER_IDS.split(",").map((id) => Number(id.trim())),
);

// --- Reply threading (persisted) ---
const STATE_FILE = "./mirror-state.json";

function loadState() {
  try {
    const { aToB, bToA } = JSON.parse(readFileSync(STATE_FILE, "utf8"));
    return { aToB: new Map(aToB), bToA: new Map(bToA) };
  } catch {
    return { aToB: new Map(), bToA: new Map() };
  }
}

function saveState(aToB, bToA) {
  writeFileSync(
    STATE_FILE,
    JSON.stringify({ aToB: [...aToB], bToA: [...bToA] }),
  );
}

const { aToB, bToA } = loadState();
console.log(`Loaded ${aToB.size} mirrored message pairs from state file.`);

// --- Attribution ---

// Builds the prefix line: "👤 Name (@handle):\n"
function attribution(user) {
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ");
  const handle = user.username ? ` (@${user.username})` : "";
  return `👤 ${name}${handle}:\n`;
}

// Telegram entity offsets are UTF-16 code units — same as JS string .length.
// Shift all offsets forward when we prepend text so formatting is preserved.
function shiftEntities(entities, offset) {
  if (!entities?.length) return undefined;
  return entities.map((e) => ({ ...e, offset: e.offset + offset }));
}

// Message types that support captions (text is handled separately)
const CAPTION_TYPES = [
  "photo",
  "video",
  "document",
  "audio",
  "voice",
  "animation",
];

// Mirror a message with sender attribution prepended.
//   - Text messages   → sendMessage (lets us prepend to the text with shifted entities)
//   - Media messages  → copyMessage with caption overridden
//   - Everything else → copyMessage as-is (stickers, polls, locations, etc.)
async function sendMirrored(telegram, msg, toChat, fromChat, replyTarget) {
  const prefix = attribution(msg.from);
  const opts = replyTarget ? { reply_to_message_id: replyTarget } : {};

  if (msg.text) {
    return telegram.sendMessage(toChat, prefix + msg.text, {
      ...opts,
      entities: shiftEntities(msg.entities, prefix.length),
    });
  }

  if (CAPTION_TYPES.some((type) => msg[type])) {
    return telegram.copyMessage(toChat, fromChat, msg.message_id, {
      ...opts,
      caption: prefix + (msg.caption ?? ""),
      caption_entities: shiftEntities(msg.caption_entities, prefix.length),
    });
  }

  // Stickers, video notes, contacts, locations, polls — no caption support
  return telegram.copyMessage(toChat, fromChat, msg.message_id, opts);
}

// --- Bot ---
const bot = new Telegraf(BOT_TOKEN);

bot.command("chatid", (ctx) => ctx.reply(`Chat ID: ${ctx.chat.id}`));

bot.on("message", async (ctx) => {
  const msg = ctx.message;
  const chatId = msg.chat.id;
  const senderId = msg.from?.id;
  console.log(msg);

  try {
    // Group A → Group B: only from allowed senders
    if (
      chatId === groupA
      // && allowedSenders.has(senderId)
    ) {
      const replyTarget = msg.reply_to_message
        ? aToB.get(msg.reply_to_message.message_id)
        : undefined;
      const sent = await sendMirrored(
        ctx.telegram,
        msg,
        groupB,
        groupA,
        replyTarget,
      );
      aToB.set(msg.message_id, sent.message_id);
      bToA.set(sent.message_id, msg.message_id);
      saveState(aToB, bToA);
      return;
    }

    // Group B → Group A: only from you (owner)
    if (chatId === groupB && senderId === ownerId) {
      const replyTarget = msg.reply_to_message
        ? bToA.get(msg.reply_to_message.message_id)
        : undefined;
      const sent = await sendMirrored(
        ctx.telegram,
        msg,
        groupA,
        groupB,
        replyTarget,
      );
      bToA.set(msg.message_id, sent.message_id);
      aToB.set(sent.message_id, msg.message_id);
      saveState(aToB, bToA);
    }
  } catch (err) {
    console.error(
      `Failed to mirror message ${msg.message_id} from chat ${chatId}:`,
      err.message,
    );
  }
});

// --- Start ---
bot.launch();
console.log("Bot is running. Press Ctrl+C to stop.");

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
