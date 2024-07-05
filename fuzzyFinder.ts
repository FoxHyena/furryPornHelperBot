require('dotenv').config();

import axios from 'axios';
import { fileFromPath } from 'formdata-node/file-from-path';
import fs from 'fs';
import { MongoClient } from 'mongodb';
import {
  FURRY_SITES,
  FurrySite,
  FuzzySearchResult,
} from './js/types/fuzzyFinderTypes';

const FUZZYFINDER_ENDPOINT = 'https://api-next.fuzzysearch.net/v1/image';

const client = new MongoClient('mongodb://localhost:27017');
const database = client.db('furryHelperBot');
const foxbotDb = database.collection('foxbotDb');

export const fuzzyFinder = async (
  distance = 10, // Max dist
  pathToFile: string,
  searchSites: FurrySite[] = [
    FURRY_SITES.FurAffinity,
    FURRY_SITES.Twitter,
    FURRY_SITES.Unknown,
    FURRY_SITES.Weasyl,
    FURRY_SITES.e621,
  ]
): Promise<FuzzySearchResult[]> => {
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

  const siteSpecificResults = results.data
    .filter((searchResult: FuzzySearchResult) =>
      searchSites.includes(searchResult.site)
    )
    .sort(
      (a: FuzzySearchResult, b: FuzzySearchResult) =>
        a.distance && b.distance && a.distance - b.distance
    );

  foxbotDb.insertOne({
    results: siteSpecificResults,
    time: new Date().toString(),
  });

  return siteSpecificResults;
};
