import axios from 'axios';
import { fileFromPath } from 'formdata-node/file-from-path';
import {
  FURRY_SITES,
  FurrySite,
  FuzzySearchResult,
} from './js/types/fuzzyFinderTypes';
import { config } from 'dotenv';
import { MongoClient } from 'mongodb';
import { getE621Post, verifyE621user } from './js/utils/e621utils';

config();

const FUZZYFINDER_ENDPOINT = 'https://api-next.fuzzysearch.net/v1/image';

const client = new MongoClient(process.env.HELPER_BOT_MONGO_URI || '');
const database = client.db('furryHelperBot');
const foxbotDb = database.collection('foxbotDb');

type FuzzyFinderSearch = {
  results: FuzzySearchResult[];
  error?: string;
};

const asyncFilter = async (
  arr: any[],
  predicate: (...args: any[]) => Promise<boolean>
) =>
  Promise.all(arr.map(predicate)).then((results) =>
    arr.filter((_v, index) => results[index])
  );

export const fuzzyFinder = async (
  distance = 10, // Max dist is 10
  pathToFile: string,
  searchSites: FurrySite[] = [
    FURRY_SITES.FurAffinity,
    FURRY_SITES.Twitter,
    FURRY_SITES.Unknown,
    FURRY_SITES.Weasyl,
    FURRY_SITES.e621,
  ],
  userId?: number
): Promise<FuzzyFinderSearch> => {
  try {
    const form = new FormData();
    form.append('distance', String(distance));
    form.append('image', await fileFromPath(pathToFile));

    const results = await axios.post(FUZZYFINDER_ENDPOINT, form, {
      headers: {
        accept: 'application/json',
        'x-api-key': process.env.FUZZYSEARCH_TOKEN,
        'Content-Type': 'multipart/form-data',
      },
    });

    let siteSpecificResults: FuzzySearchResult[] = results.data
      .filter((searchResult: FuzzySearchResult) =>
        searchSites.includes(searchResult.site)
      )
      .sort(
        (a: FuzzySearchResult, b: FuzzySearchResult) =>
          a.distance && b.distance && a.distance - b.distance
      );

    const e621creds = await verifyE621user(userId);
    const { e621username, e621key } = e621creds;

    if (
      e621creds.isValid &&
      e621username &&
      e621key &&
      searchSites.includes(FURRY_SITES.e621)
    ) {
      console.log(
        'Valid creds :3 Filtering deleted e621 posts from search results...'
      );
      try {
        const isDeletedPost = async (res: FuzzySearchResult) => {
          const e621post = await getE621Post(
            res.site_id_str,
            e621username,
            e621key
          );

          const deleted = e621post.flags?.deleted;

          if (deleted) {
            console.log('Filtering post', e621post.id);
            return false;
          }
          return true;
        };

        siteSpecificResults = await asyncFilter(
          siteSpecificResults,
          isDeletedPost
        );

        console.log('Filtered search results', siteSpecificResults);
      } catch (error) {
        console.log('Error filtering results');
      }
    }

    foxbotDb.insertOne({
      results: siteSpecificResults,
      time: new Date().toString(),
    });

    return Promise.resolve({ results: siteSpecificResults });
  } catch (error) {
    console.log('FuzzyFinder Search Error', error);
    return Promise.reject(new Error('FuzzyFinderError'));
  }
};
