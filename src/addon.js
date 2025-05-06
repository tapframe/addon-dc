require('dotenv').config(); // Load .env file

const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const axios = require('axios');
const releaseData = require('../Data/releaseData'); // Data in release order
const moviesData = require('../Data/moviesData'); // Movie data
const seriesData = require('../Data/seriesData'); // Series data
const animationsData = require('../Data/animationsData'); // Animation data
const batmanData = require('../Data/everythingbatman'); // Batman data
const batmanAnimationData = require('../Data/everythingbatmananimation'); // Batman animation data
const supermanData = require('../Data/everythingsuperman'); // Superman data
const supermanAnimationData = require('../Data/everythingsupermananimation'); // Superman animation data
const dceuMoviesData = require('../Data/DCEUMovies'); // DCEU movie data
const modernDCSeriesData = require('../Data/DCSeries'); // Modern DC Series data

let tmdbKey, omdbKey, port;
try {
    ({ tmdbKey, omdbKey, port } = require('./config'));
} catch (error) {
    console.error('Error loading config.js. Make sure TMDB_API_KEY, OMDB_API_KEY, and PORT are set in your environment or config file.', error);
    // Use default port if not set, but keys are essential
    port = process.env.PORT || 7000;
    tmdbKey = process.env.TMDB_API_KEY;
    omdbKey = process.env.OMDB_API_KEY;
    if (!tmdbKey || !omdbKey) {
        console.error('CRITICAL: API keys (TMDB_API_KEY, OMDB_API_KEY) are missing. Addon cannot fetch metadata.');
        // Optionally exit if keys are absolutely required to run
        // process.exit(1);
    }
}

const express = require('express');
const compression = require('compression');

const app = express();
app.use(compression());

// Middleware to define cache for 3 weeks
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'public, max-age=1814400'); // 3 weeks
  next();
});


// Initialization of the add-on
console.log('Starting DC Addon...'); // Updated log
const builder = new addonBuilder(require('./manifest.json'));

// Variable to store cache separated by ID
let cachedCatalog = {};

// Function to fetch additional data (OMDb and TMDb)
async function fetchAdditionalData(item) {
  console.log('\n--- Fetching details for item: ---', item); // Log raw item

  // Basic validation of the input item
  if (!item || (!item.imdbId && !item.id) || !item.type || !item.title) { // Allow using item.id if imdbId missing
      console.warn('Skipping item due to missing essential data:', item);
      return null;
  }
  const lookupId = item.imdbId || item.id; // Prefer imdbId but use item.id as fallback
  const idPrefix = lookupId.split('_')[0]; // Check prefix (e.g., 'tt' or 'tmdb')
  const isImdb = idPrefix === 'tt' || (item.imdbId && !item.imdbId.startsWith('tmdb_'));


  // Check if API keys are available
  if (!tmdbKey || (!omdbKey && isImdb)) { // OMDb key only needed if we have an IMDb ID
      console.warn(`Skipping metadata fetch for ${item.title} (${lookupId}) because API keys are missing.`);
      // Return minimal data if keys are missing
      return {
          id: lookupId,
          type: item.type,
          name: item.type === 'series' ? item.title.replace(/ Season \d+/, '') : item.title,
          poster: item.poster || null, // Use poster from data file if available
          description: item.overview || 'Metadata lookup unavailable (API key missing).', // Use local overview
          releaseInfo: item.releaseYear || 'N/A',
          imdbRating: 'N/A',
          genres: item.genres ? item.genres.map(g => g.name) : []
      };
  }

  let omdbData = {};
  let tmdbData = {};
  let tmdbImagesData = {};

  try {
    // OMDb call only if we have a real IMDb ID
    const omdbPromise = isImdb
        ? axios.get(`http://www.omdbapi.com/?i=${lookupId}&apikey=${omdbKey}`).catch((err) => {
              console.error(`OMDB error for ${lookupId}: ${err.message}`);
              return {};
          })
        : Promise.resolve({}); // Resolve immediately if no IMDb ID

    // TMDb search/details call
    // We need TMDb ID for images, try to get it from item first
    let effectiveTmdbId = item.tmdbId || (idPrefix === 'tmdb' ? lookupId.split('_')[1] : null);
    let tmdbDetailsPromise;
    if (effectiveTmdbId) {
        // If we have tmdbId, fetch details directly
        const tmdbDetailsUrl = `https://api.themoviedb.org/3/${item.type}/${effectiveTmdbId}?api_key=${tmdbKey}&language=en-US`;
        tmdbDetailsPromise = axios.get(tmdbDetailsUrl).catch((err) => {
            console.error(`TMDB Details error for ${item.type}/${effectiveTmdbId}: ${err.message}`);
        return {};
        });
    } else {
        // If no tmdbId, search TMDb by title/year
        const tmdbSearchUrl = `https://api.themoviedb.org/3/search/${item.type}?api_key=${tmdbKey}&query=${encodeURIComponent(item.title)}&year=${item.releaseYear}`;
        tmdbDetailsPromise = axios.get(tmdbSearchUrl).then(res => res.data?.results?.[0] ? getTmdbDetails(res.data.results[0].id, item.type) : {}).catch((err) => {
            console.error(`TMDB Search error for ${item.title}: ${err.message}`);
        return {};
        });
    }

    // Fetch Images using TMDb ID (if we found one)
    const tmdbImagesPromise = tmdbDetailsPromise.then(detailsRes => {
        const foundTmdbId = detailsRes?.data?.id || effectiveTmdbId; // Get ID from details if available
        if (foundTmdbId) {
            const tmdbImagesUrl = `https://api.themoviedb.org/3/${item.type}/${foundTmdbId}/images?api_key=${tmdbKey}`;
            return axios.get(tmdbImagesUrl).catch((err) => {
        if (!err.response || err.response.status !== 404) {
             console.warn(`TMDb Images error for ${item.title}: ${err.message}`);
        }
                return {};
            });
        } else {
            return Promise.resolve({}); // No TMDb ID, no images
        }
    });

    console.log(`Fetching data for ${item.title} (${lookupId})...`);
    const [omdbRes, tmdbDetailsResult, tmdbImagesRes] = await Promise.all([
      omdbPromise,
      tmdbDetailsPromise,
      tmdbImagesPromise
    ]);

    omdbData = omdbRes.data || {};
    tmdbData = tmdbDetailsResult.data || {}; // If searched, this might already be details
    tmdbImagesData = tmdbImagesRes.data || {};

    // Poster priority: local data -> TMDb -> OMDb -> fallback
    let poster = item.poster || null;
    if (!poster && tmdbData.poster_path) {
      poster = `https://image.tmdb.org/t/p/w500${tmdbData.poster_path}`;
    }
    if (!poster && omdbData.Poster && omdbData.Poster !== 'N/A') {
      poster = omdbData.Poster;
    }
    if (!poster) {
      // poster = `https://via.placeholder.com/150x225.png?text=No+Poster`; // Generic Placeholder
      console.warn(`No poster found for ${item.title} (${lookupId}).`);
       return null; // Skip items without posters as per previous request?
    }

    let logoUrl = null;
    if (tmdbImagesData.logos && tmdbImagesData.logos.length > 0) {
      let bestLogo = tmdbImagesData.logos.find(logo => logo.iso_639_1 === 'en');
      if (!bestLogo) {
        bestLogo = tmdbImagesData.logos[0];
      }
      if (bestLogo && bestLogo.file_path) {
          logoUrl = `https://image.tmdb.org/t/p/original${bestLogo.file_path}`;
      }
    }
    console.log(`   > Selected logo URL: ${logoUrl || 'Not found'}`);

    // Description priority: local data -> TMDb -> OMDb -> fallback
    const description = item.overview || tmdbData.overview || omdbData.Plot || 'No description available.';
    if (description === 'No description available.') {
         console.warn(`No overview/plot found for ${item.title} (${lookupId}).`);
         return null; // Skip items without overview?
    }

    const meta = {
      id: lookupId, // Use the ID we actually used for lookup
      type: item.type,
      name: item.type === 'series' ? item.title.replace(/ Season \d+/, '') : item.title,
      logo: logoUrl,
      poster: poster,
      description: description,
      releaseInfo: item.releaseYear || (tmdbData.release_date ? tmdbData.release_date.split('-')[0] : (tmdbData.first_air_date ? tmdbData.first_air_date.split('-')[0] : 'N/A')),
      imdbRating: omdbData.imdbRating || 'N/A',
      // Use TMDb genres if available, otherwise fallback to local genres
      genres: tmdbData.genres ? tmdbData.genres.map(g => g.name) : (item.genres ? item.genres.map(g => g.name) : [])
    };

    console.log('   > Returning metadata:', { ...meta, description: meta.description.substring(0, 50) + '...'}); // Log truncated desc
    return meta;
  } catch (err) {
    console.error(`Error processing ${item.title} (${lookupId}): ${err.message}`);
    return null;
  }
}

// Define catalog handler
builder.defineCatalogHandler(async ({ type, id }) => {
  console.log(`Catalog requested - Type: ${type}, ID: ${id}`);

  if (cachedCatalog[id]) {
    console.log(`✅ Returning cached catalog for ID: ${id}`);
    return cachedCatalog[id];
  }

  let dataSource;
  let dataSourceName = id;

  // Load data based on catalog ID
  try {
  switch (id) {
    case 'dc-chronological':
          dataSource = require('../Data/chronologicalData'); // Assuming this exists
      break;
    case 'dc-release':
          dataSource = releaseData; // Already required
      break;
    case 'dc-movies':
          dataSource = moviesData; // Already required
      break;
    case 'dc-series':
          dataSource = seriesData; // Already required
      break;
    case 'dc-animations':
          dataSource = animationsData; // Already required
      break;
        case 'dc-batman': // Original Batman catalog
          dataSource = batmanData; // Already required
      break;
    case 'dc-batman-animations':
          dataSource = batmanAnimationData; // Already required
      break;
        case 'dc-superman': // Original Superman catalog
          dataSource = supermanData; // Already required
      break;
    case 'dc-superman-animations':
          dataSource = supermanAnimationData; // Already required
          break;
        // --- Add cases for new catalogs ---
        case 'dceu_movies':
          dataSource = dceuMoviesData; // Use newly required data
          dataSourceName = 'DCEU Movies';
          break;
        case 'dc_modern_series':
          dataSource = modernDCSeriesData; // Use newly required data
          dataSourceName = 'DC Modern Series';
      break;
    default:
      console.warn(`Unrecognized catalog ID: ${id}`);
          return Promise.resolve({ metas: [] });
  }
    if (!Array.isArray(dataSource)) {
        throw new Error(`Data source for ID ${id} is not a valid array.`);
    }
      console.log(`Loaded ${dataSource.length} items for catalog: ${dataSourceName}`);
  } catch (error) {
      console.error(`❌ Error loading data for catalog ID ${id}:`, error.message);
      return Promise.resolve({ metas: [] });
  }

  console.log(`⏳ Generating catalog for ${dataSourceName}...`);
  const metas = await Promise.all(
    dataSource.map(item => fetchAdditionalData(item))
  );

  const validMetas = metas.filter(item => item !== null);
  console.log(`✅ Catalog generated with ${validMetas.length} items for ID: ${id}`);

  cachedCatalog[id] = { metas: validMetas };
  return cachedCatalog[id];
});

// Server configuration
console.log('Initializing addon interface...');
const addonInterface = builder.getInterface();

console.log('Starting server...');
serveHTTP(addonInterface, {
  port,
  beforeMiddleware: app // applies compression and cache
});
