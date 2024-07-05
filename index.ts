import axios, { AxiosError } from 'axios';
import { Context, Markup, Telegraf, session } from 'telegraf';
import { message } from 'telegraf/filters';
import fs from 'fs';
import { fuzzyFinder } from './fuzzyFinder';
import { finished } from 'stream';
import { promisify } from 'util';
import { MongoClient, ObjectId } from 'mongodb';
import {
  deleteE621entry,
  getE621postLink,
  getE621value,
  hasCompleteE621config,
  updateE621value,
} from './js/utils/e621utils';
import { HelperBotContext } from './js/types/botTypes';
import { FURRY_SITES } from './js/types/fuzzyFinderTypes';
import { E621KeyDoc } from './js/types/e621types';
require('dotenv').config();

const finishedStream = promisify(finished);
const bot = new Telegraf<HelperBotContext>(process.env.BOT_TOKEN || '');
const client = new MongoClient('mongodb://localhost:27017');
const database = client.db('furryHelperBot');

const e621keys = database.collection('e621tokens');
const telegramDb = database.collection('telegramDb');

bot.use(session());

const logToFile = async (data: any) => {
  await fs.writeFile('./test.json', JSON.stringify(data), (err) => {
    if (err) console.log('reh D;', err);
  });
};

bot.on(message('photo'), async (ctx, next) => {
  telegramDb.insertOne({
    chat: ctx.chat,
    message: ctx.message,
    time: new Date().toString(),
  });

  const messagePhotos = ctx.message.photo;
  const fileId = messagePhotos[2].file_id;
  const url = await ctx.telegram.getFileLink(fileId);
  const imagePath = `./photos/${ctx.update.message.message_id}.jpg`;

  await axios({
    url: String(url),
    responseType: 'stream',
  }).then((response) => {
    const writer = fs.createWriteStream(imagePath);
    response.data.pipe(writer);
    return finishedStream(writer);
  });

  const fuzzyResults = await fuzzyFinder(2, imagePath, [FURRY_SITES.e621]);

  if (fuzzyResults.length === 0) {
    await ctx.telegram.sendMessage(
      ctx.message.chat.id,
      `I couldn't find it ;c`
    );
  } else {
    const topResult = fuzzyResults[0];
    ctx.session ??= { searchResult: topResult };

    const hasE621Config = await hasCompleteE621config(ctx.from.id);

    const e621Button = Markup.button.callback(
      'Add to e621 favorites',
      'addToFavorites'
    );

    const resultKeyboard = hasE621Config
      ? { ...Markup.inlineKeyboard([e621Button]) }
      : {};

    await ctx.telegram.sendMessage(
      ctx.message.chat.id,
      `Woof woof! I found it :3 ${getE621postLink(topResult.site_id_str)}`,
      {
        ...resultKeyboard,
      }
    );
  }

  // Delete the image
  await fs.unlink(imagePath, (err) => {
    if (err) console.error('Error unlinking file', err);
  });

  return next();
});

bot.action('addToFavorites', async (ctx, next) => {
  await ctx.answerCbQuery();

  await ctx.editMessageReplyMarkup(
    Markup.inlineKeyboard([
      Markup.button.callback('Hot >:3 Adding...', 'processingAdd'),
    ]).reply_markup
  );

  try {
    const userE621Doc = await e621keys.findOne<E621KeyDoc>({
      userId: ctx.from.id,
    });
    const searchResult = ctx.session?.searchResult;

    if (userE621Doc && searchResult) {
      const form = new FormData();
      form.append('post_id', searchResult.site_id_str);
      const { e621key: apiKey, e621username: username } = userE621Doc;

      if (!apiKey || !username) {
        await ctx.editMessageReplyMarkup(
          Markup.inlineKeyboard([
            Markup.button.callback(
              "Can't add :/ Incomplete e621 info",
              'favAdded'
            ),
          ]).reply_markup
        );

        const noUsername = `\nUsername missing ;c add it with /sete621username`;
        const noKey = `\ne621 API Key missing ;c add it with /sete621key`;

        await ctx.reply(
          `Wanna start saving things to your e621 favs? Update the following info:\n${
            noUsername + noKey
          }`
        );

        return next();
      }

      await axios.post(`https://e621.net/favorites.json`, form, {
        headers: {
          Authorization: 'Basic ' + btoa(`${username}:${apiKey}`),
          'User-Agent': 'Furry Porn Helper Bot (made by stinkyhyena on e621)',
          'Content-Type': 'multipart/form-data',
        },
      });

      await ctx.editMessageReplyMarkup(
        Markup.inlineKeyboard([Markup.button.callback('Added! ✅', 'favAdded')])
          .reply_markup
      );
    }
  } catch (error: any) {
    if (
      error?.response?.data?.message === 'You have already favorited this post'
    ) {
      await ctx.editMessageReplyMarkup(
        Markup.inlineKeyboard([
          Markup.button.callback('Already in your favs ;3', 'favAdded'),
        ]).reply_markup
      );
    } else {
      await ctx.editMessageReplyMarkup(
        Markup.inlineKeyboard([
          Markup.button.callback(
            'Something went wrong :/ make sure your info is set up correctly',
            'favAdded'
          ),
        ]).reply_markup
      );
      console.error(error);
    }
  }

  return next();
});

bot.command('sete621key', async (ctx, next) => {
  const userId = ctx.from?.id;
  const e621key = ctx.args[0];

  await updateE621value(userId, { e621key });

  return next();
});

bot.command('sete621username', async (ctx, next) => {
  const userId = ctx.from?.id;
  const e621username = ctx.args[0];

  await updateE621value(userId, { e621username });

  return next();
});

bot.command('deletee621info', async (ctx, next) => {
  await deleteE621entry(ctx.from.id);

  await ctx.reply('All done :3');
  return next();
});

bot.command('displaye621information', async (ctx, next) => {
  const userId = ctx.from.id;

  const userInfo = await getE621value(userId);

  if (!userInfo) {
    await ctx.reply(
      'No information found! Add your account info with /sete621key and /sete621username'
    );

    return next();
  }

  const { e621username, e621key } = userInfo;

  const replyMessage = `Bark\\! :3 Here's your currently set info for *e621*:\n\n*Username*:\t\t${
    e621username || 'Not found :c Set it with /sete621username'
  }\n*API Key*:\t\t${
    e621key ? `||${e621key}||` : 'Not set ;\\-; Set it with /sete621key'
  }`;

  await ctx.reply(replyMessage, { parse_mode: 'MarkdownV2' });

  return next();
});

bot.command('start', (ctx) => {
  ctx.reply(
    `Woof hey! Welcome in! :3\n\nCurrently this is an e621 search bot. Send a picture and I'll try to identify it in e621! Wanna be able to add found images to your e621 favorites? Add your username and API key with /sete621username and /sete621key.\n\nHave any questions? Reach out to @hyenafox! :3`
  );
});

bot.launch();

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
