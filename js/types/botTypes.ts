import { FuzzySearchResult } from './fuzzyFinderTypes';
import { Context } from 'telegraf';

export interface SessionData {
  searchResult?: FuzzySearchResult;
}

export interface HelperBotContext extends Context {
  session?: SessionData;
  args: string[];
}

export type Next = () => Promise<void>;
