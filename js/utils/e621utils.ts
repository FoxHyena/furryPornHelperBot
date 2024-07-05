import { HelperBotContext, Next } from '../types/botTypes';
import { MongoClient } from 'mongodb';
import { E621KeyDoc } from '../types/e621types';

const client = new MongoClient('mongodb://localhost:27017');
const database = client.db('furryHelperBot');
const e621keys = database.collection('e621tokens');

export const updateE621value = async (
  userId: number,
  updateDoc: E621KeyDoc,
  upsert = true
) => {
  try {
    const insertRes = await e621keys.updateOne(
      { userId },
      {
        $set: {
          ...updateDoc,
        },
      },
      {
        upsert,
      }
    );
    console.log(insertRes);
  } catch (error) {
    console.error(error);
  }
};

export const getE621value = async (
  userId: number
): Promise<E621KeyDoc | null> => {
  const result = await e621keys.findOne<E621KeyDoc>({ userId });
  return result;
};

export const deleteE621entry = async (userId: number) => {
  await e621keys.deleteOne({ userId });
};

export const hasCompleteE621config = async (userId: number) => {
  const userInfo = await getE621value(userId);

  return (
    userInfo &&
    userInfo.e621username !== undefined &&
    userInfo.e621key !== undefined
  );
};

export const getE621postLink = (postId: string) =>
  `https://e621.net/posts/${postId}`;
