require('dotenv').config(); // Load .env file

const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const axios = require('axios');
const releaseData = require('../Data/releaseData'); // Data in release order
const moviesData = require('../Data/moviesData'); // Movie data
const seriesData = require('../Data/seriesData'); // Series data
const animationsData = require('../Data/animationsData'); // Animation data

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
  if (!item || !item.imdbId || !item.type || !item.title) {
      console.warn('Skipping item due to missing essential data:', item);
      return null;
  }

  // Check if API keys are available
  if (!tmdbKey || !omdbKey) {
      console.warn(`Skipping metadata fetch for ${item.title} (${item.imdbId}) because API keys are missing.`);
      // Return minimal data if keys are missing
      return {
          id: item.imdbId,
          type: item.type,
          name: item.type === 'series' ? item.title.replace(/ Season \d+/, '') : item.title,
          poster: item.poster || null, // Use poster from data file if available
          description: 'Metadata lookup unavailable (API key missing).',
          releaseInfo: item.releaseYear || 'N/A',
          imdbRating: 'N/A',
          genres: []
      };
  }

  try {
    const omdbUrl = `http://www.omdbapi.com/?i=${item.imdbId}&apikey=${omdbKey}`;
    // Separate TMDb calls for search and images
    const tmdbSearchUrl = `https://api.themoviedb.org/3/search/${item.type === 'movie' ? 'movie' : 'tv'}?api_key=${tmdbKey}&query=${encodeURIComponent(item.title)}&year=${item.releaseYear}`;
    const tmdbImagesUrl = `https://api.themoviedb.org/3/${item.type === 'movie' ? 'movie' : 'tv'}/${item.tmdbId}/images?api_key=${tmdbKey}`;

    console.log(`Fetching data for ${item.title} (${item.imdbId})...`);
    // Fetch OMDb, TMDb Search, and TMDb Images concurrently
    const [omdbRes, tmdbSearchRes, tmdbImagesRes] = await Promise.all([
      axios.get(omdbUrl).catch((err) => {
        console.error(`OMDB error for ${item.imdbId}: ${err.message}`);
        return {};
      }),
      axios.get(tmdbSearchUrl).catch((err) => {
        console.error(`TMDB error for ${item.title}: ${err.message}`);
        return {};
      }),
      // Fetch Images
      axios.get(tmdbImagesUrl).catch((err) => {
        // Don't log error if it's just a 404 (no images found)
        if (!err.response || err.response.status !== 404) {
             console.warn(`TMDb Images error for ${item.title}: ${err.message}`);
        }
        return {}; // Return empty object on error
      })
    ]);

    const omdbData = omdbRes.data || {};
    const tmdbData = tmdbSearchRes.data?.results?.[0] || {};
    const tmdbImagesData = tmdbImagesRes.data || {};

    // Prioritize poster from item, then OMDB, TMDB, and fallback
    let poster = item.poster || null;
    if (!poster && omdbData.Poster && omdbData.Poster !== 'N/A') {
      poster = omdbData.Poster;
    }
    if (!poster && tmdbData.poster_path) {
      poster = `https://image.tmdb.org/t/p/w500${tmdbData.poster_path}`;
    }
    if (!poster) {
      poster = `https://m.media-amazon.com/images/M/MV5BMTc5MDE2ODcwNV5BMl5BanBnXkFtZTgwMzI2NzQ2NzM@._V1_SX300.jpg`;
      console.warn(`No poster found for ${item.title} (${item.imdbId}).`);
    }

    // --- Find the best logo --- 
    let logoUrl = null;
    if (tmdbImagesData.logos && tmdbImagesData.logos.length > 0) {
      // Prefer English logo if available
      let bestLogo = tmdbImagesData.logos.find(logo => logo.iso_639_1 === 'en');
      // Otherwise, take the first one
      if (!bestLogo) {
        bestLogo = tmdbImagesData.logos[0];
      }
      if (bestLogo && bestLogo.file_path) {
          // Use original size for logo for better quality
          logoUrl = `https://image.tmdb.org/t/p/original${bestLogo.file_path}`;
      }
    }
    // --- End Logo Logic ---
    console.log(`   > Selected logo URL: ${logoUrl || 'Not found'}`); // Log selected logo

    const meta = {
      id: item.imdbId,
      type: item.type,
      name: item.type === 'series' ? item.title.replace(/ Season \d+/, '') : item.title,
      logo: logoUrl,
      poster: poster,
      description: tmdbData.overview || omdbData.Plot || 'No description available',
      releaseInfo: item.releaseYear,
      imdbRating: omdbData.imdbRating || 'N/A',
      genres: tmdbData.genres ? tmdbData.genres.map(g => g.name) : (item.genres ? item.genres.map(g => g.name) : ['Action', 'Adventure'])
    };

    console.log('   > Returning metadata:', meta); // Log final meta object
    return meta;
  } catch (err) {
    console.error(`Error processing ${item.title} (${item.imdbId}): ${err.message}`);
    return null; // Return null for items with error, will be filtered later
  }
}

// Define catalog handler
builder.defineCatalogHandler(async ({ type, id }) => {
  console.log(`Catalog requested - Type: ${type}, ID: ${id}`);

  // Return cached catalog if available
  if (cachedCatalog[id]) {
    console.log(`✅ Returning cached catalog for ID: ${id}`);
    return cachedCatalog[id];
  }

  let dataSourcePath;
  let dataSourceName = id;

  // Map catalog IDs to data file paths
  switch (id) {
    case 'dc-chronological':
      dataSourcePath = '../Data/chronologicalData';
      break;
    case 'dc-release':
      dataSourcePath = '../Data/releaseData';
      break;
    case 'dc-movies':
      dataSourcePath = '../Data/moviesData';
      break;
    case 'dc-series':
      dataSourcePath = '../Data/seriesData';
      break;
    case 'dc-animations':
      dataSourcePath = '../Data/animationsData';
      break;
    default:
      console.warn(`Unrecognized catalog ID: ${id}`);
      return Promise.resolve({ metas: [] }); // Return empty for unrecognized IDs
  }

  let dataSource = [];
  try {
    // Dynamically require the data source only when needed
    dataSource = require(dataSourcePath);
    if (!Array.isArray(dataSource)) {
      throw new Error(`Data file ${dataSourcePath}.js does not contain a valid array.`);
    }
    console.log(`Loaded ${dataSource.length} items from ${dataSourcePath}.js`);
  } catch (error) {
      console.error(`❌ Error loading data from ${dataSourcePath}.js:`, error.message);
      // Return empty catalog if data loading fails
      return Promise.resolve({ metas: [] });
  }

  // Process data to generate catalog
  console.log(`⏳ Generating catalog for ${dataSourceName}... (This might take a moment for the first request)`);
  const metas = await Promise.all(
    dataSource.map(fetchAdditionalData)
  );

  // Filter out null items (which failed)
  const validMetas = metas.filter(item => item !== null);
  console.log(`✅ Catalog generated with ${validMetas.length} items for ID: ${id}`);

  // Store catalog in cache by ID
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
