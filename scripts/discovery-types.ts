// Common shape written by the discover-*.ts scripts to data/discovery/<source>.json.
export type DiscoveredResult = {
  title: string;
  url: string;
  className: string | null;
  publishedAt: string | null;
};

export type Discovered = {
  source: string;
  slug: string;
  name: string;
  club: string | null;
  country: string | null;
  startDate: string | null;
  endDate: string | null;
  classes: string[];
  results: DiscoveredResult[];
  extra?: Record<string, unknown>;
};
