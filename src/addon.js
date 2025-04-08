const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const axios = require('axios');
const mcuData = require('./mcuData');
const { tmdbKey, omdbKey, port } = require('./config');

// Inicialização do add-on
console.log('Starting Marvel Addon v1.0.1...');
const builder = new addonBuilder(require('../manifest.json'));

// Definição do catálogo
builder.defineCatalogHandler(async ({ type, id }) => {
  console.log(`Catalog requested - Type: ${type}, ID: ${id}`);
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
        releaseInfo: item.releaseYear,
        imdbRating: omdbData.imdbRating,
        genres: tmdbData.genres ? tmdbData.genres.map(g => g.name) : ['Action', 'Adventure']
      };
    })
  );

  console.log('Catalog generated successfully');
  return { metas }; // Ordem já definida no mcuData.js
});

// Configuração do servidor
console.log('Initializing addon interface...');
const addonInterface = builder.getInterface();

console.log('Starting server...');
serveHTTP(addonInterface, { port });
console.log(`Marvel Addon running on port ${port}`);
