import { E621KeyDoc } from '../types/e621types';
import axios from 'axios';
import { MongoClient } from 'mongodb';
import { config } from 'dotenv';

config();
const client = new MongoClient(process.env.HELPER_BOT_MONGO_URI || '');
const database = client.db('furryHelperBot');
const e621keys = database.collection('e621tokens');

const E621_POSTS_ENDPOINT = 'https://e621.net/posts.json';

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

export const analyzeE621favs = (e621posts: any[]) => {};

export const E621_ERROR_TYPES = {
  INCOMPLETE_INFO: 'INCOMPLETE_INFO',
  INVALID_INFO: 'INVALID_INFO',
  UNKNOWN: 'UNKNOWN',
} as const;

export type E621ValidationError = keyof typeof E621_ERROR_TYPES;

export type E621Validation = {
  isValid: boolean;
  error?: E621ValidationError;
  e621username?: string;
  e621key?: string;
};

export const getE621headers = (
  e621username: string,
  e621key: string,
  requestType: string
) => {
  const baseHeaders = {
    Authorization: 'Basic ' + btoa(`${e621username}:${e621key}`),
    'User-Agent': 'Furry Porn Helper Bot (made by stinkyhyena on e621)',
  };

  if (requestType === 'POST') {
    return {
      ...baseHeaders,
      'Content-Type': 'multipart/form-data',
    };
  }

  return baseHeaders;
};

export const getE621Post = async (
  post_id: string,
  e621username: string,
  e621key: string
) => {
  try {
    const post = await axios.get(`https://e621.net/posts/${post_id}.json`, {
      headers: getE621headers(e621username, e621key, 'GET'),
    });

    console.log('Post got >:3', post_id);
    return post.data.post;
  } catch (error) {
    console.log('Error getting post', post_id);
  }

  return {};
};

export const verifyE621credentials = async (
  e621username?: string,
  e621key?: string
): Promise<E621Validation> => {
  if (!e621username || !e621key) {
    return Promise.resolve({
      isValid: false,
      error: E621_ERROR_TYPES.INCOMPLETE_INFO,
    });
  }

  try {
    const testPost = await axios.get(E621_POSTS_ENDPOINT, {
      headers: getE621headers(e621username, e621key, 'GET'),
      params: {
        limit: 1,
      },
    });

    if (testPost.status === 200) {
      return Promise.resolve({
        isValid: true,
        e621username,
        e621key,
      });
    }
  } catch (error: any) {
    console.log(error);

    const errorStatus = error.response?.status;
    if (errorStatus === 401 || errorStatus === 403) {
      return Promise.resolve({
        isValid: false,
        error: E621_ERROR_TYPES.INVALID_INFO,
      });
    }
    return Promise.resolve({ isValid: false, error: E621_ERROR_TYPES.UNKNOWN });
  }

  return Promise.resolve({ isValid: false, error: E621_ERROR_TYPES.UNKNOWN });
};

export const verifyE621user = async (
  userId?: number
): Promise<E621Validation> => {
  if (!userId) {
    return Promise.resolve({
      isValid: false,
      error: E621_ERROR_TYPES.INCOMPLETE_INFO,
    });
  }

  const { e621username, e621key } = (await getE621value(userId)) || {};

  return await verifyE621credentials(e621username, e621key);
};
