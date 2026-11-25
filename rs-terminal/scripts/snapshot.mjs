/**
 * Builds the static snapshots the terminal falls back to.
 *
 *   node scripts/snapshot.mjs
 *
 * Three sources, three different shapes of truth:
 *
 *   RS3      Jagex itemdb. One price per day, no bid/ask and no volume, and the
 *            endpoint sends no CORS header, so it can only be read at build time.
 *   Crypto   CoinGecko. Daily closes plus a 24h quote, CORS open, so the app also
 *            refreshes this live at runtime.
 *   NFTs     CoinGecko NFT endpoint. Floor price per collection, refreshed live.
 *
 * Everything is written into public/ and served as a static asset. Nothing here
 * runs on every build: the committed snapshots are the artefact, this is how you
 * refresh them.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

/** Re-running a snapshot keeps what already worked, so a 429 only costs one call. */
async function previous(name) {
  try {
    const { readFile } = await import('node:fs/promises');
    return JSON.parse(await readFile(join(OUT, name), 'utf8'));
  } catch {
    return null;
  }
}
const UA = 'vector-terminal/1.0 (portfolio dashboard; contact: none)';

/**
 * CoinGecko stamps the last point of a chart payload at the moment of the request, so
 * it is today's unfinished bar. Only points on a UTC day boundary are settled closes,
 * and only those belong in a series that has to reproduce. The app drops the same rows
 * when it reads (barsFrom in src/data/crypto.ts), so the committed file matches it.
 */
const settledOnly = (rows) =>
  rows.filter(([t, p]) => Number.isFinite(p) && p > 0 && t % 86_400_000 === 0);

const RS3_ITEMS = [
  'Necronium bar',
  'Elder rune bar',
  'Orikalkum bar',
  'Onyx',
  'Uncut dragonstone',
  'Dragon bones',
  'Magic logs',
  'Yew logs',
  'Grimy torstol',
  'Clean torstol',
  'Soul rune',
  'Blood rune',
  'Nature rune',
  'Cannonball',
  'Shark',
  'Rocktail',
];

const COINS = [
  'bitcoin',
  'ethereum',
  'solana',
  'binancecoin',
  'ripple',
  'cardano',
  'dogecoin',
  'avalanche-2',
  'chainlink',
  'polkadot',
  'litecoin',
  'tron',
  'the-open-network',
  'shiba-inu',
];

const NFTS = [
  'bored-ape-yacht-club',
  'cryptopunks',
  'pudgy-penguins',
  'azuki',
  'mutant-ape-yacht-club',
  'doodles-official',
  'moonbirds',
  'meebits',
];

/** CoinGecko's free tier answers roughly five calls a minute from one address. */
const DELAY = Number(process.env.SNAPSHOT_DELAY_MS ?? 18_000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * CoinGecko sends these as a number, a string, or null when a collection is too
 * thin to have one. Null must stay null: a missing change is not a flat one.
 */
const pct = (v) =>
  v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v) / 100;

async function getJson(url, ms = 20_000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

/** RS3 wiki pages carry the GE item id in the infobox. */
async function rs3IdFor(name) {
  const url =
    'https://runescape.wiki/api.php?action=parse&prop=wikitext&format=json&formatversion=2&page=' +
    encodeURIComponent(name);
  const body = await getJson(url);
  const text = body?.parse?.wikitext ?? '';
  const grab = (key) => {
    const m = text.match(new RegExp(`\\|\\s*${key}\\s*=\\s*([^\\n|}]*)`));
    return m ? m[1].trim() : '';
  };
  const id = Number(grab('id'));
  if (!Number.isFinite(id) || id <= 0) throw new Error(`no id for ${name}`);
  return {
    id,
    limit: Number(grab('limit')) || 0,
    members: /yes/i.test(grab('members')),
    examine: grab('examine').replace(/^"|"$/g, '') || 'No examine text recorded.',
  };
}

async function buildRs3() {
  const items = [];
  for (const name of RS3_ITEMS) {
    try {
      const meta = await rs3IdFor(name);
      const [detail, graph] = await Promise.all([
        getJson(`https://secure.runescape.com/m=itemdb_rs/api/catalogue/detail.json?item=${meta.id}`),
        getJson(`https://secure.runescape.com/m=itemdb_rs/api/graph/${meta.id}.json`),
      ]);
      const daily = graph?.daily ?? {};
      const rows = Object.keys(daily)
        .map((k) => [Number(k), Number(daily[k])])
        .filter(([t, p]) => Number.isFinite(t) && Number.isFinite(p) && p > 0)
        .sort((a, b) => a[0] - b[0]);
      if (rows.length < 60) throw new Error(`only ${rows.length} days`);
      items.push({
        id: meta.id,
        name: detail?.item?.name ?? name,
        limit: meta.limit,
        members: meta.members,
        examine: meta.examine,
        rows,
      });
      console.log(`  rs3  ${name.padEnd(20)} ${meta.id}  ${rows.length}d  ${detail?.item?.current?.price ?? '?'} gp`);
    } catch (err) {
      console.log(`  rs3  ${name.padEnd(20)} SKIP (${err.message})`);
    }
    await sleep(400);
  }
  const asOf = Math.max(...items.map((i) => i.rows[i.rows.length - 1][0]));
  await writeFile(join(OUT, 'rs3-snapshot.json'), JSON.stringify({ asOf, items }));
  console.log(`rs3: ${items.length} items -> public/rs3-snapshot.json`);
}

async function buildCrypto() {
  const kept = (await previous('crypto-snapshot.json'))?.coins ?? [];
  const have = new Map(kept.map((c) => [c.slug, c]));
  const ids = COINS.join(',');
  const quotes = {};
  try {
    const markets = await getJson(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&price_change_percentage=24h`,
    );
    for (const c of markets) {
      quotes[c.id] = {
        price: c.current_price,
        chg24: (c.price_change_percentage_24h ?? 0) / 100,
        chg7: null,
        volume: c.total_volume,
        mcap: c.market_cap,
        name: c.name,
        symbol: (c.symbol ?? '').toUpperCase(),
      };
    }
  } catch (err) {
    console.log(`  crypto quotes failed: ${err.message}`);
  }

  const coins = [];
  for (const id of COINS) {
    try {
      const chart = await getJson(
        `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=365&interval=daily`,
      );
      const prices = chart?.prices ?? [];
      const vols = new Map((chart?.total_volumes ?? []).map(([t, v]) => [t, v]));
      // CoinGecko ends the payload with a point at "now": today, unfinished. Only the
      // points stamped at a UTC day boundary are settled closes, and only those belong in
      // a series that has to reproduce. The app drops the same row when it reads (see
      // barsFrom in src/data/crypto.ts); this keeps the committed file matching it.
      const rows = settledOnly(prices.map(([t, p]) => [t, p, vols.get(t) ?? 0]));
      if (rows.length < 60) throw new Error(`only ${rows.length} settled days`);
      const q = quotes[id] ?? {};
      coins.push({
        // Kept rows already hold an id, so a new coin must clear the highest one in
        // hand rather than the array length, or it takes a number already in use.
        id: Math.max(0, ...coins.map((c) => c.id)) + 1,
        slug: id,
        symbol: q.symbol ?? id.slice(0, 4).toUpperCase(),
        name: q.name ?? id,
        quote: {
          price: q.price ?? rows[rows.length - 1][1],
          chg24: q.chg24 ?? null,
          volume: q.volume ?? rows[rows.length - 1][2],
          mcap: q.mcap ?? null,
        },
        rows,
      });
      console.log(`  crypto ${id.padEnd(14)} ${rows.length}d`);
    } catch (err) {
      // A failure costs this coin one refresh, not its history: fall back to the rows
      // already on disk instead of dropping the coin. Keeping the old rows on every
      // run, which is what this used to do, meant the committed series never advanced.
      const kept = have.get(id);
      if (kept) {
        const q = quotes[id];
        // Rows kept from an older file were fetched before this rule existed, so they
        // can still carry a partial day; filter them on the way out, not just on fetch.
        coins.push({
          ...kept,
          rows: settledOnly(kept.rows),
          ...(q ? { quote: { ...kept.quote, price: q.price, chg24: q.chg24, volume: q.volume, mcap: q.mcap } } : {}),
        });
        console.log(`  crypto ${id.padEnd(14)} kept previous rows (${err.message})`);
      } else {
        console.log(`  crypto ${id.padEnd(14)} SKIP (${err.message})`);
      }
    }
    await sleep(DELAY);
  }

  const asOf = Math.max(...coins.flatMap((c) => c.rows.map((r) => r[0])));
  await writeFile(join(OUT, 'crypto-snapshot.json'), JSON.stringify({ asOf, coins }));
  console.log(`crypto: ${coins.length} coins -> public/crypto-snapshot.json`);
}

async function buildNfts() {
  const kept = (await previous('nft-snapshot.json'))?.collections ?? [];
  // A row saved before the change fields parsed is worth as little as no row.
  const complete = (c) => c && c.floorUsd != null && c.chg24 != null;
  const have = new Map(kept.filter(complete).map((c) => [c.slug, c]));
  const rows = [];
  for (const slug of NFTS) {
    if (have.has(slug)) {
      rows.push(have.get(slug));
      console.log(`  nft ${slug.padEnd(22)} kept from previous snapshot`);
      continue;
    }
    try {
      const d = await getJson(`https://api.coingecko.com/api/v3/nfts/${slug}`);
      rows.push({
        slug,
        name: d.name,
        symbol: d.symbol,
        floorUsd: d?.floor_price?.usd ?? null,
        floorNative: d?.floor_price?.native_currency ?? null,
        nativeSymbol: d.native_currency_symbol ?? 'ETH',
        mcap: d?.market_cap?.usd ?? null,
        volume24: d?.volume_24h?.usd ?? null,
        chg24: pct(d.floor_price_24h_percentage_change),
        chg7: pct(d.floor_price_7d_percentage_change),
        chg30: pct(d.floor_price_30d_percentage_change),
        supply: d.total_supply ?? null,
        sales24: d.one_day_sales ?? null,
      });
      console.log(
        `  nft ${slug.padEnd(22)} floor $${Math.round(d?.floor_price?.usd ?? 0).toLocaleString('en-US')}`,
      );
    } catch (err) {
      console.log(`  nft ${slug.padEnd(22)} SKIP (${err.message})`);
    }
    await sleep(DELAY);
  }
  const asOf = Date.now();
  await writeFile(join(OUT, 'nft-snapshot.json'), JSON.stringify({ asOf, collections: rows }));
  console.log(`nft: ${rows.length} collections -> public/nft-snapshot.json`);
}

await mkdir(OUT, { recursive: true });
const which = process.argv[2] ?? 'all';
if (which === 'all' || which === 'rs3') await buildRs3();
if (which === 'all' || which === 'crypto') await buildCrypto();
if (which === 'all' || which === 'nft') await buildNfts();
