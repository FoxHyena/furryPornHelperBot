import { ObjectId } from 'mongodb';

export type E621KeyDoc = {
  _id?: ObjectId;
  userId?: number;
  e621key?: string;
  e621username?: string;
};
