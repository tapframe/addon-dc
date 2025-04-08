const { addonBuilder } = require('stremio-addon-sdk');
const axios = require('axios');
const mcuData = require('./mcuData');
const { tmdbKey, omdbKey, port } = require('./config');

console.log('Starting addon initialization...');
const builder = new addonBuilder(require('../manifest.json'));

builder.defineCatalogHandler(async ({ type, id }) => {
  console.log('Catalog handler called with type:', type, 'id:', id);
  if (id !== 'marvel-mcu') return { metas: [] };

  const metas = await Promise.all(
    mcuData.map(async (item) => {
      const tmdbUrl = `https://api.themoviedb.org/3/${item.type}/${item.tmdbId}?api_key=${tmdbKey}`;
      const omdbUrl = `http://www.omdbapi.com/?i=tt${item.tmdbId}&apikey=${omdbKey}`;

      const [tmdbRes, omdbRes] = await Promise.all([
        axios.get(tmdbUrl).catch(() => ({})),
        axios.get(omdbUrl).catch(() => ({}))
      ]);

      const tmdbData = tmdbRes.data || {};
      const omdbData = omdbRes.data || {};

      return {
        id: `tt${item.tmdbId}`,
        type: item.type,
        name: item.type === 'series' ? item.title.replace(/ Season \d+/, '') : item.title,
        poster: tmdbData.poster_path ? `https://image.tmdb.org/t/p/w500${tmdbData.poster_path}` : null,
        description: tmdbData.overview || omdbData.Plot || 'No description available',
        releaseInfo: item.releaseDate,
        imdbRating: omdbData.imdbRating,
        genres: tmdbData.genres ? tmdbData.genres.map(g => g.name) : ['Action', 'Adventure']
      };
    })
  );

  return { metas: metas.sort((a, b) => a.releaseInfo.localeCompare(b.releaseInfo)) };
});

console.log('Getting addon interface...');
const addonInterface = builder.getInterface();

const server = require('http').createServer(async (req, res) => {
  console.log('Received request:', req.url);
  
  // Handler para a raiz (/)
  if (req.url === '/' || req.url === '') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Marvel Addon is running. Use /manifest.json to access the addon.');
    return;
  }

  try {
    const response = await addonInterface.get(req, res);
    if (response) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(response));
    }
  } catch (err) {
    console.error('Error handling request:', err);
    res.writeHead(500);
    res.end('Internal Server Error');
  }
});

server.listen(port, () => console.log(`Add-on running on port ${port}`));
