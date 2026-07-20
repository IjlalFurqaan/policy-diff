/**
 * Cache tags.
 *
 * A published change invalidates exactly two things: the company's own
 * timeline, and the front-page feed that lists every company's changes. The
 * other companies' pages stay cached.
 */
export const companyTag = (slug: string) => `company:${slug}`;
export const FEED_TAG = "feed";
export const changeTag = (id: string) => `change:${id}`;
