export const FURRY_SITES = {
  FurAffinity: 'FurAffinity',
  Weasyl: 'Weasyl',
  Twitter: 'Twitter',
  e621: 'e621',
  Unknown: 'Unknown',
} as const;

export type FurrySite = keyof typeof FURRY_SITES;

export type FuzzySearchResult = {
  artists?: string[];
  distance?: number;
  filename: string;
  hash?: number;
  hash_str?: string;
  posted_at?: string;
  rating?: string;
  searched_hash?: number;
  searched_hash_str?: string;
  sha256?: string;
  site_id: number;
  site_id_str: string;
  tags: string[];
  url: string;
  site: FurrySite;
  site_info: {
    sources: string[];
  };
};
