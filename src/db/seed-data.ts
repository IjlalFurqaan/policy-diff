/**
 * The v1 watchlist.
 *
 * Every URL here is a public, non-login-walled HTML page. Companies move their
 * legal pages fairly often; a URL that starts 404ing is recorded on the
 * document row as `lastError` rather than failing the run, so a stale entry
 * shows up in the crawl report instead of silently going quiet.
 */
export interface SeedCompany {
  slug: string;
  name: string;
  /** Domain used to resolve a favicon-sized logo. */
  domain: string;
  tosUrl: string;
  privacyUrl: string;
}

export const SEED_COMPANIES: SeedCompany[] = [
  {
    slug: "spotify",
    name: "Spotify",
    domain: "spotify.com",
    tosUrl: "https://www.spotify.com/us/legal/end-user-agreement/",
    privacyUrl: "https://www.spotify.com/us/legal/privacy-policy/",
  },
  {
    slug: "discord",
    name: "Discord",
    domain: "discord.com",
    tosUrl: "https://discord.com/terms",
    privacyUrl: "https://discord.com/privacy",
  },
  {
    slug: "reddit",
    name: "Reddit",
    domain: "reddit.com",
    tosUrl: "https://www.redditinc.com/policies/user-agreement",
    privacyUrl: "https://www.reddit.com/policies/privacy-policy",
  },
  {
    slug: "linkedin",
    name: "LinkedIn",
    domain: "linkedin.com",
    tosUrl: "https://www.linkedin.com/legal/user-agreement",
    privacyUrl: "https://www.linkedin.com/legal/privacy-policy",
  },
  {
    slug: "zoom",
    name: "Zoom",
    domain: "zoom.com",
    tosUrl: "https://www.zoom.com/en/trust/terms/",
    privacyUrl: "https://www.zoom.com/en/trust/privacy/",
  },
  {
    slug: "dropbox",
    name: "Dropbox",
    domain: "dropbox.com",
    tosUrl: "https://www.dropbox.com/terms",
    privacyUrl: "https://www.dropbox.com/privacy",
  },
  {
    slug: "notion",
    name: "Notion",
    domain: "notion.com",
    tosUrl: "https://www.notion.com/terms",
    privacyUrl: "https://www.notion.com/privacy",
  },
  {
    slug: "strava",
    name: "Strava",
    domain: "strava.com",
    tosUrl: "https://www.strava.com/legal/terms",
    privacyUrl: "https://www.strava.com/legal/privacy",
  },
  {
    slug: "duolingo",
    name: "Duolingo",
    domain: "duolingo.com",
    tosUrl: "https://www.duolingo.com/terms",
    privacyUrl: "https://www.duolingo.com/privacy",
  },
  {
    slug: "substack",
    name: "Substack",
    domain: "substack.com",
    tosUrl: "https://substack.com/tos",
    privacyUrl: "https://substack.com/privacy",
  },
  {
    slug: "patreon",
    name: "Patreon",
    domain: "patreon.com",
    tosUrl: "https://www.patreon.com/policy/legal",
    privacyUrl: "https://privacy.patreon.com/policies",
  },
  {
    slug: "steam",
    name: "Steam",
    domain: "steampowered.com",
    tosUrl: "https://store.steampowered.com/subscriber_agreement/",
    privacyUrl: "https://store.steampowered.com/privacy_agreement/",
  },
  {
    slug: "twitch",
    name: "Twitch",
    domain: "twitch.tv",
    tosUrl: "https://www.twitch.tv/p/legal/terms-of-service/",
    privacyUrl: "https://www.twitch.tv/p/legal/privacy-notice/",
  },
  {
    slug: "airbnb",
    name: "Airbnb",
    domain: "airbnb.com",
    tosUrl: "https://www.airbnb.com/help/article/2908",
    privacyUrl: "https://www.airbnb.com/help/article/2855",
  },
  {
    slug: "uber",
    name: "Uber",
    domain: "uber.com",
    tosUrl: "https://www.uber.com/legal/en/document/?name=general-terms-of-use",
    privacyUrl: "https://www.uber.com/legal/en/document/?name=privacy-notice",
  },
];

export function logoUrlFor(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
}
