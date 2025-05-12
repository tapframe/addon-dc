const express = require('express');
const path = require('path');
const cors = require('cors');
const compression = require('compression');
const axios = require('axios');
const releaseData = require('../Data/releaseData');
const moviesData = require('../Data/moviesData');
const seriesData = require('../Data/seriesData');
const animationsData = require('../Data/animationsData');
const batmanData = require('../Data/everythingbatman');
const batmanAnimationData = require('../Data/everythingbatmananimation');
const supermanData = require('../Data/everythingsuperman');
const supermanAnimationData = require('../Data/everythingsupermananimation');
const dceuMoviesData = require('../Data/DCEUMovies');
const modernDCSeriesData = require('../Data/DCSeries');

require('dotenv').config();

// Get API keys and port
let tmdbKey, omdbKey, port;
try {
    ({ tmdbKey, omdbKey, port } = require('./config'));
} catch (error) {
    console.error('Error loading config.js. Using environment variables.', error);
    port = process.env.PORT || 7000;
    tmdbKey = process.env.TMDB_API_KEY;
    omdbKey = process.env.OMDB_API_KEY;
    
    if (!tmdbKey || !omdbKey) {
        console.error('CRITICAL: API keys (TMDB_API_KEY, OMDB_API_KEY) are missing. Addon cannot fetch metadata.');
    }
}

const app = express();

// Middleware
app.use(compression());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Cache for 3 weeks
app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'public, max-age=1814400');
    next();
});

// Route to serve configure.html for paths like /catalog/id1,id2/configure
app.get('/catalog/:ids/configure', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'configure.html'));
});

// Variable to store cache separated by ID
let cachedCatalog = {};

// Helper function for TMDb details fetching
async function getTmdbDetails(id, type) {
    const url = `https://api.themoviedb.org/3/${type}/${id}?api_key=${tmdbKey}&language=en-US&append_to_response=external_ids`;
    try {
        const res = await axios.get(url);
        return res;
    } catch (err) {
        console.error(`TMDb details error for ${type}/${id}: ${err.message}`);
        return {};
    }
}

// Helper function to replace posters with RPDB posters when a valid key is provided
function replaceRpdbPosters(rpdbKey, metas) {
    if (!rpdbKey) {
        return metas;
    }

    return metas.map(meta => {
        // If the meta has an IMDb ID in proper format (tt12345), use it for RPDB poster
        const imdbId = meta.id.startsWith('tt') ? meta.id : null;
        
        if (imdbId) {
            return {
                ...meta, 
                poster: `https://api.ratingposterdb.com/${rpdbKey}/imdb/poster-default/${imdbId}.jpg`
            };
        }
        
        // If no valid IMDb ID, keep original poster
        return meta;
    });
}

// Helper function to fetch additional metadata
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
        tmdbDetailsPromise = axios.get(tmdbSearchUrl).then(res => 
            res.data?.results?.[0] ? getTmdbDetails(res.data.results[0].id, item.type) : {})
        .catch((err) => {
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

// Get all available catalogs
function getAllCatalogs() {
    return [
        {
            type: "DC",
            id: "dc-chronological",
            name: "Chronological Order"
        },
        {
            type: "DC",
            id: "dc-release",
            name: "Release Order"
        },
        {
            type: "DC",
            id: "dc-movies",
            name: "Movies"
        },
        {
            type: "DC",
            id: "dceu_movies",
            name: "DCEU Movies"
        },
        {
            type: "DC",
            id: "dc-series",
            name: "Series"
        },
        {
            type: "DC",
            id: "dc_modern_series",
            name: "DC Modern Series"
        },
        {
            type: "DC",
            id: "dc-animations",
            name: "Animations"
        },
        {
            type: "DC",
            id: "dc-batman-animations",
            name: "Batman Animations"
        },
        {
            type: "DC",
            id: "dc-superman-animations",
            name: "Superman Animations"
        },
        {
            type: "DC",
            id: "dc-batman",
            name: "Batman Collection"
        },
        {
            type: "DC",
            id: "dc-superman",
            name: "Superman Collection"
        }
    ];
}

// Define the configuration page
app.get('/configure', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'configure.html'));
});

// Custom catalog manifest endpoint
app.get('/catalog/:catalogsParam/manifest.json', (req, res) => {
    const { catalogsParam } = req.params;
    
    // Parse configuration parameter for RPDB key
    let rpdbKey = null;
    let selectedCatalogIds = catalogsParam;
    
    // Check if the parameter contains catalog IDs and RPDB key in format "catalog1,catalog2:rpdbKey"
    if (catalogsParam.includes(':')) {
        const parts = catalogsParam.split(':');
        selectedCatalogIds = parts[0]; // First part is catalog IDs
        rpdbKey = parts[1];    // Second part is RPDB key
        console.log(`Custom manifest with RPDB key: ${rpdbKey}`);
        selectedCatalogIds = selectedCatalogIds.split(',').map(id => id.trim());
    } else {
        selectedCatalogIds = catalogsParam.split(',').map(id => id.trim());
    }

    const allCatalogs = getAllCatalogs(); // Fetch all defined catalogs
    
    // Filter catalogs based on selected IDs
    const selectedApiCatalogs = allCatalogs.filter(catalog => selectedCatalogIds.includes(catalog.id));
    
    if (selectedApiCatalogs.length === 0) {
        return res.status(404).send('No valid catalogs selected or found.');
    }
    
    // Create a custom ID that includes RPDB key info if present
    const customId = rpdbKey 
        ? `com.tapframe.dcaddon.custom.${selectedCatalogIds.join('.')}.rpdb`
        : `com.tapframe.dcaddon.custom.${selectedCatalogIds.join('.')}`;
        
    // Limit ID length to avoid issues
    const manifestId = customId.slice(0, 100);
    
    // Create the customized manifest
    const manifest = {
        id: manifestId,
        name: "DC Universe Custom",
        description: `Your personalized selection of DC catalogs: ${selectedApiCatalogs.map(c => c.name).join(', ')}`,
        version: "1.2.0",
        logo: "https://github.com/tapframe/addon-dc/blob/main/assets/icon.png?raw=true",
        background: "https://github.com/tapframe/addon-dc/blob/main/assets/background.jpg?raw=true",
        catalogs: selectedApiCatalogs,
        resources: ["catalog"],
        types: ["movie", "series"],
        idPrefixes: ["dc_"],
        behaviorHints: {
            configurable: true
        },
        contactEmail: "nayifveliya99@gmail.com"
    };
    
    res.json(manifest);
});

// Default manifest endpoint
app.get('/manifest.json', (req, res) => {
    console.log('Default manifest requested');
    
    // Check for RPDB key in query parameters
    const rpdbKey = req.query.rpdb || null;
    if (rpdbKey) {
        console.log(`Default manifest with RPDB key: ${rpdbKey}`);
    }
    
    // Create manifest ID that includes RPDB key info if present
    const manifestId = rpdbKey 
        ? "com.tapframe.dcaddon.rpdb"
        : "com.tapframe.dcaddon";
    
    const manifest = {
        id: manifestId,
        name: "DC Universe",
        description: "Explore the DC Universe by release date, movies, series, and animations!",
        version: "1.2.0",
        logo: "https://github.com/tapframe/addon-dc/blob/main/assets/icon.png?raw=true",
        background: "https://github.com/tapframe/addon-dc/blob/main/assets/background.jpg?raw=true",
        catalogs: getAllCatalogs(),
        resources: ["catalog"],
        types: ["movie", "series"],
        idPrefixes: ["dc_"],
        behaviorHints: {
            configurable: true
        },
        contactEmail: "nayifveliya99@gmail.com"
    };
    
    res.json(manifest);
});

// API endpoint for catalog info
app.get('/api/catalogs', (req, res) => {
    console.log('Catalog info requested');
    
    const catalogInfo = [
        { 
            id: 'dc-chronological', 
            name: 'Chronological Order', 
            category: 'Timeline',
            description: 'Browse the DC Universe in chronological story order',
            icon: 'calendar-alt'
        },
        { 
            id: 'dc-release', 
            name: 'Release Order', 
            category: 'Timeline',
            description: 'Browse content in original release date order',
            icon: 'clock'
        },
        { 
            id: 'dc-movies', 
            name: 'Movies', 
            category: 'Content Type',
            description: 'All DC movies across different eras',
            icon: 'film'
        },
        { 
            id: 'dceu_movies', 
            name: 'DCEU Movies', 
            category: 'Curated',
            description: 'Official DC Extended Universe film collection',
            icon: 'film'
        },
        { 
            id: 'dc-series', 
            name: 'Series', 
            category: 'Content Type',
            description: 'All DC television series',
            icon: 'tv'
        },
        { 
            id: 'dc_modern_series', 
            name: 'DC Modern Series', 
            category: 'Curated',
            description: 'Recent DC live-action series (2010s-Present)',
            icon: 'tv'
        },
        { 
            id: 'dc-animations', 
            name: 'Animations', 
            category: 'Content Type',
            description: 'All DC animated features and series',
            icon: 'play-circle'
        },
        { 
            id: 'dc-batman-animations', 
            name: 'Batman Animations', 
            category: 'Character',
            description: 'Batman animated movies and series',
            icon: 'mask'
        },
        { 
            id: 'dc-superman-animations', 
            name: 'Superman Animations', 
            category: 'Character',
            description: 'Superman animated movies and series',
            icon: 'shield-alt'
        },
        { 
            id: 'dc-batman', 
            name: 'Batman Collection', 
            category: 'Character',
            description: 'All Batman live-action movies',
            icon: 'mask'
        },
        { 
            id: 'dc-superman', 
            name: 'Superman Collection', 
            category: 'Character',
            description: 'All Superman live-action movies',
            icon: 'shield-alt'
        }
    ];
    
    res.json(catalogInfo);
});

// Custom catalog endpoint
app.get('/catalog/:catalogsParam/catalog/:type/:id.json', async (req, res) => {
    const { catalogsParam, type, id } = req.params;
    console.log(`Custom catalog requested - Catalogs: ${catalogsParam}, Type: ${type}, ID: ${id}`);
    
    // Parse configuration parameter for RPDB key
    let rpdbKey = null;
    let catalogIds = catalogsParam;
    
    // Check if the parameter contains catalog IDs and RPDB key in format "catalog1,catalog2:rpdbKey"
    if (catalogsParam.includes(':')) {
        const parts = catalogsParam.split(':');
        catalogIds = parts[0]; // First part is catalog IDs
        rpdbKey = parts[1];    // Second part is RPDB key
        console.log(`RPDB key detected: ${rpdbKey}`);
    }
    
    // Check cache
    const cacheKey = `custom-${id}-${catalogsParam}`;
    if (cachedCatalog[cacheKey]) {
        console.log(`✅ Returning cached catalog for ID: ${cacheKey}`);
        // Apply RPDB posters to cached results if key is provided
        if (rpdbKey) {
            const metasWithRpdbPosters = replaceRpdbPosters(rpdbKey, cachedCatalog[cacheKey].metas);
            return res.json({ metas: metasWithRpdbPosters });
        }
        return res.json(cachedCatalog[cacheKey]);
    }
    
    let dataSource;
    let dataSourceName = id;
    
    // Load data based on catalog ID
    try {
        switch (id) {
            case 'dc-chronological':
                dataSource = require('../Data/chronologicalData');
                break;
            case 'dc-release':
                dataSource = releaseData;
                break;
            case 'dc-movies':
                dataSource = moviesData;
                break;
            case 'dc-series':
                dataSource = seriesData;
                break;
            case 'dc-animations':
                dataSource = animationsData;
                break;
            case 'dc-batman':
                dataSource = batmanData;
                break;
            case 'dc-batman-animations':
                dataSource = batmanAnimationData;
                break;
            case 'dc-superman':
                dataSource = supermanData;
                break;
            case 'dc-superman-animations':
                dataSource = supermanAnimationData;
                break;
            case 'dceu_movies':
                dataSource = dceuMoviesData;
                dataSourceName = 'DCEU Movies';
                break;
            case 'dc_modern_series':
                dataSource = modernDCSeriesData;
                dataSourceName = 'DC Modern Series';
                break;
            default:
                console.warn(`Unrecognized catalog ID: ${id}`);
                return res.json({ metas: [] });
        }
        
        if (!Array.isArray(dataSource)) {
            throw new Error(`Data source for ID ${id} is not a valid array.`);
        }
        console.log(`Loaded ${dataSource.length} items for catalog: ${dataSourceName}`);
    } catch (error) {
        console.error(`❌ Error loading data for catalog ID ${id}:`, error.message);
        return res.json({ metas: [] });
    }
    
    console.log(`⏳ Generating catalog for ${dataSourceName}...`);
    const metas = await Promise.all(
        dataSource.map(item => fetchAdditionalData(item))
    );
    
    const validMetas = metas.filter(item => item !== null);
    console.log(`✅ Catalog generated with ${validMetas.length} items for ID: ${id}`);
    
    // Store in cache
    cachedCatalog[cacheKey] = { metas: validMetas };
    
    // Apply RPDB posters if key is provided
    if (rpdbKey) {
        const metasWithRpdbPosters = replaceRpdbPosters(rpdbKey, validMetas);
        return res.json({ metas: metasWithRpdbPosters });
    }
    
    // Return the data
    return res.json(cachedCatalog[cacheKey]);
});

// Default catalog endpoint
app.get('/catalog/:type/:id.json', async (req, res) => {
    const { type, id } = req.params;
    console.log(`Default catalog requested - Type: ${type}, ID: ${id}`);
    
    // Check for RPDB key in query parameters
    const rpdbKey = req.query.rpdb || null;
    if (rpdbKey) {
        console.log(`RPDB key detected in query: ${rpdbKey}`);
    }
    
    // Check cache
    const cacheKey = `default-${id}`;
    if (cachedCatalog[cacheKey]) {
        console.log(`✅ Returning cached catalog for ID: ${cacheKey}`);
        // Apply RPDB posters to cached results if key is provided
        if (rpdbKey) {
            const metasWithRpdbPosters = replaceRpdbPosters(rpdbKey, cachedCatalog[cacheKey].metas);
            return res.json({ metas: metasWithRpdbPosters });
        }
        return res.json(cachedCatalog[cacheKey]);
    }
    
    let dataSource;
    let dataSourceName = id;
    
    // Load data based on catalog ID
    try {
        switch (id) {
            case 'dc-chronological':
                dataSource = require('../Data/chronologicalData');
                break;
            case 'dc-release':
                dataSource = releaseData;
                break;
            case 'dc-movies':
                dataSource = moviesData;
                break;
            case 'dc-series':
                dataSource = seriesData;
                break;
            case 'dc-animations':
                dataSource = animationsData;
                break;
            case 'dc-batman':
                dataSource = batmanData;
                break;
            case 'dc-batman-animations':
                dataSource = batmanAnimationData;
                break;
            case 'dc-superman':
                dataSource = supermanData;
                break;
            case 'dc-superman-animations':
                dataSource = supermanAnimationData;
                break;
            case 'dceu_movies':
                dataSource = dceuMoviesData;
                dataSourceName = 'DCEU Movies';
                break;
            case 'dc_modern_series':
                dataSource = modernDCSeriesData;
                dataSourceName = 'DC Modern Series';
                break;
            default:
                console.warn(`Unrecognized catalog ID: ${id}`);
                return res.json({ metas: [] });
        }
        
        if (!Array.isArray(dataSource)) {
            throw new Error(`Data source for ID ${id} is not a valid array.`);
        }
        console.log(`Loaded ${dataSource.length} items for catalog: ${dataSourceName}`);
    } catch (error) {
        console.error(`❌ Error loading data for catalog ID ${id}:`, error.message);
        return res.json({ metas: [] });
    }
    
    console.log(`⏳ Generating catalog for ${dataSourceName}...`);
    const metas = await Promise.all(
        dataSource.map(item => fetchAdditionalData(item))
    );
    
    const validMetas = metas.filter(item => item !== null);
    console.log(`✅ Catalog generated with ${validMetas.length} items for ID: ${id}`);
    
    // Store in cache
    cachedCatalog[cacheKey] = { metas: validMetas };
    
    // Apply RPDB posters if key is provided
    if (rpdbKey) {
        const metasWithRpdbPosters = replaceRpdbPosters(rpdbKey, validMetas);
        return res.json({ metas: metasWithRpdbPosters });
    }
    
    // Return the data
    return res.json(cachedCatalog[cacheKey]);
});

// Default routes
app.get('/', (req, res) => {
    res.redirect('/configure');
});

app.listen(port, () => {
    console.log(`DC Universe Addon server running at http://localhost:${port}/`);
    console.log(`Configuration page: http://localhost:${port}/configure`);
    console.log(`To install with custom catalogs: stremio://localhost:${port}/catalog/CATALOG_IDS/manifest.json`);
});

// Export the fetchAdditionalData function for testing
module.exports = { fetchAdditionalData };