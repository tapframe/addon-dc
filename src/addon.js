const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const axios = require('axios');
const mcuData = require('./mcuData');
const { tmdbKey, omdbKey, port } = require('./config');

// Inicialização do add-on
console.log('Starting Marvel Addon v1.0.0...');
const builder = new addonBuilder(require('./manifest.json'));

// Definição do catálogo
builder.defineCatalogHandler(async ({ type, id }) => {
  console.log(`Catalog requested - Type: ${type}, ID: ${id}`);
  if (id !== 'marvel-mcu') return { metas: [] };

  const metas = await Promise.all(
    mcuData.map(async (item) => {
      try {
        const omdbUrl = `http://www.omdbapi.com/?i=${item.imdbId}&apikey=${omdbKey}`;
        // Buscar no TMDB por título e ano, em vez de imdb_id
        const tmdbSearchUrl = `https://api.themoviedb.org/3/search/${item.type === 'movie' ? 'movie' : 'tv'}?api_key=${tmdbKey}&query=${encodeURIComponent(item.title)}&year=${item.releaseYear}`;

        console.log(`Fetching data for ${item.title} (${item.imdbId})...`);
        const [omdbRes, tmdbRes] = await Promise.all([
          axios.get(omdbUrl).catch((err) => {
            console.error(`OMDB error for ${item.imdbId}: ${err.message}`);
            return {};
          }),
          axios.get(tmdbSearchUrl).catch((err) => {
            console.error(`TMDB error for ${item.title}: ${err.message}`);
            return {};
          })
        ]);

        const omdbData = omdbRes.data || {};
        const tmdbData = tmdbRes.data?.results?.[0] || {};

        // Priorizar pôster do mcuData.js (se disponível), depois OMDB, TMDB, e fallback
        let poster = item.poster || null;
        if (!poster && omdbData.Poster && omdbData.Poster !== 'N/A') {
          poster = omdbData.Poster;
        }
        if (!poster && tmdbData.poster_path) {
          poster = `https://image.tmdb.org/t/p/w500${tmdbData.poster_path}`;
        }
        if (!poster) {
          poster = `https://m.media-amazon.com/images/M/MV5BMTc5MDE2ODcwNV5BMl5BanBnXkFtZTgwMzI2NzQ2NzM@._V1_SX300.jpg`;
          console.warn(`No poster found for ${item.title} (${item.imdbId}), using fallback.`);
        }

        return {
          id: item.imdbId,
          type: item.type,
          name: item.type === 'series' ? item.title.replace(/ Season \d+/, '') : item.title,
          poster: poster,
          description: tmdbData.overview || omdbData.Plot || 'No description available',
          releaseInfo: item.releaseYear,
          imdbRating: omdbData.imdbRating || 'N/A',
          genres: tmdbData.genres ? tmdbData.genres.map(g => g.name) : ['Action', 'Adventure']
        };
      } catch (err) {
        console.error(`Error processing ${item.title} (${item.imdbId}): ${err.message}`);
        return null; // Retorna null para itens com erro, será filtrado depois
      }
    })
  );

  // Filtrar itens nulos (que falharam)
  const validMetas = metas.filter(item => item !== null);
  console.log(`Catalog generated successfully with ${validMetas.length} items`);
  return { metas: validMetas };
});

// Configuração do servidor
console.log('Initializing addon interface...');
const addonInterface = builder.getInterface();

console.log('Starting server...');
serveHTTP(addonInterface, { port });
console.log(`Marvel Addon running on port ${port}`);
