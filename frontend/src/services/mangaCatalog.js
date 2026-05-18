const KNOWN_TITLES = [
  'One Piece',
  'One Punch Man',
  'Solo Leveling',
  'Naruto',
  'Bleach',
  'Attack on Titan',
  'Jujutsu Kaisen',
  'Demon Slayer',
  'My Hero Academia',
  'Tokyo Ghoul',
];

const timeoutFetch = async (url, options = {}, timeoutMs = 9000) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
};

const normalizeTitle = (item) =>
  item?.title || item?.name || item?.title_english || item?.title_romaji || '';

const normalizeEntry = (item, source) => ({
  id: `${source}-${item.id || item.mal_id || item.slug || normalizeTitle(item)}`,
  title: normalizeTitle(item),
  cover:
    item?.images?.jpg?.image_url ||
    item?.images?.webp?.image_url ||
    item?.coverImage?.large ||
    item?.coverImage?.medium ||
    item?.cover ||
    null,
  description:
    item?.synopsis || item?.description || item?.background || item?.siteUrl || '',
  source,
  score: item?.score || item?.averageScore || null,
  url:
    item?.url || item?.siteUrl || (item?.slug ? `https://mangadex.org/title/${item.slug}` : null),
});

const fetchFromJikan = async (query) => {
  const response = await timeoutFetch(`https://api.jikan.moe/v4/manga?q=${encodeURIComponent(query)}&limit=8`);
  if (!response.ok) throw new Error(`Jikan ${response.status}`);
  const payload = await response.json();
  return (payload?.data || []).map((item) => normalizeEntry(item, 'jikan'));
};

const fetchFromAniList = async (query) => {
  const gql = {
    query: `query ($search: String) { Page(page: 1, perPage: 8) { media(search: $search, type: MANGA, sort: POPULARITY_DESC) { id title { romaji english } coverImage { large medium } description(asHtml: false) averageScore siteUrl } } }`,
    variables: { search: query },
  };
  const response = await timeoutFetch('https://graphql.anilist.co', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(gql),
  });
  if (!response.ok) throw new Error(`AniList ${response.status}`);
  const payload = await response.json();
  return (payload?.data?.Page?.media || []).map((item) =>
    normalizeEntry(
      {
        id: item.id,
        title: item?.title?.english || item?.title?.romaji,
        coverImage: item.coverImage,
        description: item.description,
        averageScore: item.averageScore,
        siteUrl: item.siteUrl,
      },
      'anilist',
    ),
  );
};

const dedupeByTitle = (entries) => {
  const seen = new Set();
  return entries.filter((entry) => {
    const key = entry.title.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const getKnownMangaCatalog = async () => {
  const queries = [...KNOWN_TITLES];
  const all = [];

  for (const query of queries) {
    const sources = await Promise.allSettled([fetchFromJikan(query), fetchFromAniList(query)]);
    sources.forEach((result) => {
      if (result.status === 'fulfilled') {
        all.push(...result.value);
      }
    });
  }

  return dedupeByTitle(all).sort((a, b) => (b.score || 0) - (a.score || 0));
};

export { KNOWN_TITLES };
