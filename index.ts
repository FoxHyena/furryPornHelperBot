import axios from 'axios';
import { Markup, NarrowedContext, Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import {
  E621_ERROR_TYPES,
  E621_FAVORITES_ENDPOINT,
  analyzeE621favs,
  deleteE621entry,
  getE621Post,
  getE621headers,
  getE621value,
  updateE621value,
  verifyE621credentials,
  verifyE621user,
} from './js/utils/e621utils';
import { HelperBotContext, Next } from './js/types/botTypes';
import { E621KeyDoc } from './js/types/e621types';
import { config } from 'dotenv';
import { MongoClient } from 'mongodb';
import {
  CallbackQuery,
  Update,
  Message,
  PhotoSize,
} from 'telegraf/typings/core/types/typegram';
import { table } from 'table';
import { errorReply, findPhoto } from './js/utils/botUtils';

const Sentry = require('@sentry/node');

config();

Sentry.init({ dsn: process.env.HELPER_BOT_SENTRY_DSN });

const bot = new Telegraf<HelperBotContext>(process.env.BOT_TOKEN || '');
const client = new MongoClient(process.env.HELPER_BOT_MONGO_URI || '');
const database = client.db('furryHelperBot');

const e621keys = database.collection('e621tokens');
const telegramDb = database.collection('telegramDb');
const userErrorsDb = database.collection('userErrors');

bot.on(message('photo'), async (ctx, next) => {
  telegramDb.insertOne({
    chat: ctx.chat,
    message: ctx.message,
    time: new Date().toString(),
    type: 'PhotoMessage',
  });

  await findPhoto(ctx, next);

  return next();
});

bot.command('retry', async (ctx, next) => {
  //Another unforgivable type transgression I'm so sorry. 2 horny 2 type uwu
  const replyMessage = ctx.message.reply_to_message as any;

  if (!replyMessage || !replyMessage?.photo) {
    return await ctx.reply(
      "Try replying to a message that has a pic in it 'n' try again perv ;3"
    );
  }

  telegramDb.insertOne({
    chat: ctx.chat,
    message: ctx.message,
    time: new Date().toString(),
    type: 'PhotoMessageRetry',
    repliedtoMessage: ctx.message.reply_to_message,
  });

  await findPhoto(ctx as any, next, true, replyMessage.photo, replyMessage);

  return next();
});

bot.command('submiterror', async (ctx, next) => {
  const errorDoc = {
    reporterName: ctx.from.first_name,
    reporter: ctx.from.username,
    reporterId: ctx.from.id,
    description: ctx.payload,
  };

  userErrorsDb.insertOne(errorDoc);

  try {
    await ctx.telegram.sendMessage(
      process.env.HELPER_BOT_ADMIN_CHAT_ID || '',
      `Bark! New error submitted by ${errorDoc.reporterName} ${
        errorDoc.reporter ? `(@${errorDoc.reporter})` : ''
      }`
    );

    await ctx.reply('Error submitted. Thank you! :3');
    console.log('User error submitted', errorDoc);
  } catch (error) {
    console.log('Error submitting user error', error);
  }

  return await next();
});

type FavoritesData = {
  e621PostId: string;
};

const addToFavorites = async (
  ctx: NarrowedContext<
    HelperBotContext,
    Update.CallbackQueryUpdate<CallbackQuery>
  >,
  next: Next,
  data: FavoritesData,
  callbackFunction: string = ''
) => {
  console.log('New Add to favs function called w/ post id:', data.e621PostId);

  await next();

  telegramDb.insertOne({
    action: 'addToFavorites',
    context: {
      message: ctx.message,
    },
  });

  await ctx.editMessageReplyMarkup(
    Markup.inlineKeyboard([
      Markup.button.callback('Hot >:3 Adding...', 'processingAdd'),
    ]).reply_markup
  );

  try {
    const userE621Doc = await e621keys.findOne<E621KeyDoc>({
      userId: ctx.from.id,
    });

    const { e621PostId } = data;

    console.log('Search result being favorited:', e621PostId);

    if (userE621Doc && e621PostId) {
      const form = new FormData();
      form.append('post_id', e621PostId);
      const { e621key: apiKey, e621username: username } = userE621Doc;

      if (!apiKey || !username) {
        await ctx.editMessageReplyMarkup(
          Markup.inlineKeyboard([
            Markup.button.callback(
              "Can't add :/ Incomplete e621 info",
              callbackFunction
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

        return;
      }

      const postRes = await axios.post(E621_FAVORITES_ENDPOINT, form, {
        headers: getE621headers(username, apiKey, 'POST'),
      });

      console.log('Favs post result', postRes);

      return await ctx.editMessageReplyMarkup(
        Markup.inlineKeyboard([Markup.button.callback('Added! ✅', 'favAdded')])
          .reply_markup
      );
    }
  } catch (error: any) {
    if (
      error.response?.data?.message === 'You have already favorited this post'
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
            callbackFunction
          ),
        ]).reply_markup
      );
      console.error(error);
    }
  }
};

bot.command('getPost', async (ctx, next) => {
  const postId = ctx.args[0];
  const userId = ctx.from.id;
  const e621info = await getE621value(userId);

  if (!e621info?.e621username || !e621info.e621key) {
    return next();
  }
  return await getE621Post(postId, e621info.e621username, e621info.e621key);
});

bot.command('analyzee621favs', async (ctx, next) => {
  const userId = ctx.from.id;
  const userArgs = ctx.args || [];
  const DEFAULT_LENGTH = 10;

  const displayLength =
    userArgs.length > 0 ? Math.round(Number(userArgs[0])) : DEFAULT_LENGTH;

  if (Number.isNaN(displayLength)) {
    return await ctx.reply(
      "Bark\\! Sorry, that's not the correct syntax\\. The correct syntax here is the command followed by the result length and tags you'd like filtered from the results: /analyzee621favs \\[list length\\] \\[filter tags\\]\n\nThe following example returns your top 10 e621 tags, not including the following tags: anthro, dialogue:\n\n`/analyzee621favs 10 anthro dialogue`",
      {
        parse_mode: 'MarkdownV2',
      }
    );
  }

  const filterTags = userArgs.slice(1);

  console.log({ displayLength, filterTags });

  try {
    const userInfo = await verifyE621user(userId);

    const { e621username, e621key, isValid, error } = userInfo;

    if (!isValid && error) {
      return await ctx.reply(errorReply(error));
    }

    if (!e621username || !e621key) {
      return await next();
    }

    const topTags = await analyzeE621favs(e621username, e621key, filterTags);
    const topNResults: [string, number | string][] = topTags.slice(
      0,
      displayLength
    );

    topNResults.unshift(['Tag', 'Count']);

    const tableifiedResults =
      '```\n' +
      table(topNResults, {
        columns: [{ alignment: 'center' }, { alignment: 'center' }],
      }) +
      '```';
    console.log(tableifiedResults);

    return await ctx.reply(
      `Here are your ✨ Top ${displayLength} ✨ e621 tags:\n\n${tableifiedResults}`,
      { parse_mode: 'MarkdownV2' }
    );
  } catch (error) {
    console.log('Error analyzing e621 favorites', error);
  }
});

bot.on('callback_query', async (ctx, next) => {
  const addToFavoritesButtonKey = 'addToFavorites';

  // *pukes* I'm so sorry, Idk why the type is incomplete for callbackQuery
  const callbackFunction = (ctx.callbackQuery as any)?.data as string;
  console.log('Callback object', ctx.callbackQuery);
  console.log('Callback data:', callbackFunction);

  if (callbackFunction.includes(addToFavoritesButtonKey)) {
    const [name, e621PostId] = callbackFunction.split(':');
    console.log('Favorite Adder split results', name, e621PostId);
    return await addToFavorites(ctx, next, { e621PostId }, callbackFunction);
  }

  // Explicit usage
  return await ctx.telegram.answerCbQuery(ctx.callbackQuery.id);
});

bot.command('sete621key', async (ctx, next) => {
  const userId = ctx.from?.id;
  const userSetKey = ctx.args[0];

  await updateE621value(userId, { e621key: userSetKey });

  const userE621Doc = await getE621value(userId);

  if (!userE621Doc) {
    await ctx.reply(errorReply(E621_ERROR_TYPES.UNKNOWN));
    return next();
  }

  const { e621username, e621key } = userE621Doc;

  if (e621key && !e621username) {
    await ctx.reply(
      "API Key set, but I'm unable to verify it as there is no username set :o Please set it with /sete621username."
    );

    return next();
  }

  const isValidKey = await verifyE621credentials(e621username, e621key);

  if (!isValidKey.isValid) {
    await ctx.reply(errorReply(isValidKey.error || E621_ERROR_TYPES.UNKNOWN));
  }

  if (isValidKey.isValid) {
    ctx.reply('🎉 API Key set and validated ✅');
  }

  return next();
});

bot.command('sete621username', async (ctx, next) => {
  const userId = ctx.from?.id;
  const userSetUsername = ctx.args[0];

  await updateE621value(userId, { e621username: userSetUsername });

  const userE621Doc = await getE621value(userId);

  if (!userE621Doc) {
    await ctx.reply(errorReply(E621_ERROR_TYPES.UNKNOWN));
    return next();
  }

  const { e621username, e621key } = userE621Doc;

  if (!e621key && e621username) {
    await ctx.reply(
      "Username set, but I'm unable to verify it as there is no API Key set :/ Please set it with /sete621key."
    );

    return next();
  }

  const isValidKey = await verifyE621credentials(e621username, e621key);

  if (!isValidKey.isValid) {
    await ctx.reply(errorReply(isValidKey.error || E621_ERROR_TYPES.UNKNOWN));
  }

  if (isValidKey.isValid) {
    ctx.reply('🎉 Username set and validated ✅');
  }

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

  const validation = await verifyE621credentials(e621username, e621key);

  const usernameMessage = `\n*Username*: ${
    e621username || 'Not found :c Set it with /sete621username'
  }`;

  const apiKeyMessage = `\n*API Key*: ${
    validation.isValid
      ? 'Verified ✅'
      : e621key
      ? 'Broken ❌ Check your username and API Key and try again ^^'
      : 'Not set ;c Set it with /sete621key'
  }`;

  const replyMessage = `Bark\\! :3 Here's your currently set info for *e621*:\n${usernameMessage}${apiKeyMessage}`;

  await ctx.reply(replyMessage, { parse_mode: 'MarkdownV2' });

  return next();
});

bot.command('start', (ctx) => {
  ctx.reply(
    `Woof hey! Welcome in! :3\n\nCurrently this is an e621 search bot. Send a picture and I'll try to identify it in e621! Wanna be able to add found images to your e621 favorites? Add your e621 username and API key with /sete621username and /sete621key.\n\nHave any questions? Reach out to @hyenafox! :3`
  );
});

bot.launch();

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
