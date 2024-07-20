import { Markup, NarrowedContext } from 'telegraf';
import {
  E621ValidationError,
  getE621postLink,
  hasCompleteE621config,
} from './e621utils';
import { HelperBotContext, Next } from '../types/botTypes';
import {
  Update,
  Message,
  PhotoSize,
  ServiceMessageBundle,
  CommonMessageBundle,
  ReplyParameters,
} from 'telegraf/typings/core/types/typegram';
import axios from 'axios';
import fs from 'fs';
import { promisify } from 'util';
import { finished } from 'stream';
import { deleteImage } from './fsUtils';
import { fuzzyFinder } from '../../fuzzyFinder';
import { FURRY_SITES } from '../types/fuzzyFinderTypes';
import { ExtraReplyMessage } from 'telegraf/typings/telegram-types';

const finishedStream = promisify(finished);

type ReplyMessage =
  | ServiceMessageBundle
  | (CommonMessageBundle & {
      reply_to_message: undefined;
    });

export const errorReply = (validationError: E621ValidationError) => {
  let errorResponse = '';

  switch (validationError) {
    case 'INCOMPLETE_INFO':
      errorResponse =
        'Your info is incomplete! Please finish setting it up n try again :3';
      break;
    case 'INVALID_INFO':
      errorResponse =
        'Your info is bunk ;c please check its accuracy and try again.';
      break;
    case 'UNKNOWN':
    default:
      errorResponse =
        "Something isn't right :o I dunno what's wrong but check all your stuff n try again!";
      break;
  }

  return errorResponse;
};

export const findPhoto = async (
  ctx: NarrowedContext<
    HelperBotContext,
    Update.MessageUpdate<Record<'photo', {}> & Message.PhotoMessage>
  >,
  next: Next,
  useAltPhoto?: boolean,
  photo: PhotoSize[] = [],
  replyMessage?: ReplyMessage
) => {
  const messagePhotos = useAltPhoto ? photo : ctx.message.photo;
  console.log('messagephotos', messagePhotos);

  const fileId = messagePhotos[2].file_id;
  const photoDir = './photos';
  const imagePath = `${photoDir}/${ctx.update.message.message_id}.jpg`;
  const userId = ctx.from.id;
  const curMessage = useAltPhoto ? replyMessage : ctx.message;
  const messageReplyId = curMessage?.message_id;
  const reply_parameters = messageReplyId
    ? ({ message_id: messageReplyId } as ReplyParameters)
    : undefined;
  console.log('reply id', messageReplyId);

  const reply = async (text: string, extra?: ExtraReplyMessage) => {
    return await ctx.telegram.sendMessage(ctx.message.chat.id, text, {
      ...extra,
      reply_parameters,
    });
  };

  try {
    const url = await ctx.telegram.getFileLink(fileId);
    await axios({
      url: String(url),
      responseType: 'stream',
    }).then(async (response) => {
      const doesPhotoDirExist = await fs.existsSync(photoDir);

      if (!doesPhotoDirExist) {
        await fs.mkdirSync(photoDir, { recursive: true });
        console.log('photos path made :3');
      }

      const writer = fs.createWriteStream(imagePath);
      response.data.pipe(writer);
      return finishedStream(writer);
    });
  } catch (error) {
    console.log('Error Fetching Telegram picture', error);

    await reply(
      'Oof :c I had an issue processing that image. Please try again!'
    );

    return await deleteImage(imagePath);
  }

  try {
    const fuzzyFinderResult = await fuzzyFinder(
      2,
      imagePath,
      [FURRY_SITES.e621],
      userId
    );

    const { results: fuzzyResults } = fuzzyFinderResult;

    if (fuzzyResults.length === 0) {
      await reply(`I couldn't find it ;c`);

      return await deleteImage(imagePath);
    }

    const topResult = fuzzyResults[0];

    const hasE621Config = await hasCompleteE621config(ctx.from.id);

    const e621Button = Markup.button.callback(
      'Add to e621 favorites',
      `addToFavorites:${topResult.site_id_str}`
    );
    const fileLink = topResult.url && `[File](${topResult.url})`;

    const post = `[Post](${getE621postLink(topResult.site_id_str)})`;

    const responseLinks = [fileLink, post]
      .filter((linkedText) => !!linkedText)
      .join(' - ');

    const resultKeyboard = hasE621Config
      ? { ...Markup.inlineKeyboard([e621Button]) }
      : {};

    await reply(`Woof woof! I found it :3 (${responseLinks})`, {
      ...resultKeyboard,
      parse_mode: 'Markdown',
    });
  } catch (error) {
    await reply(
      'Erf ;-; I broke while looking for that image. Please try again! If things really stop working submit an error with /submiterror [description]'
    );
  }

  // Delete the image
  await deleteImage(imagePath);
};
