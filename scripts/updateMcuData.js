const axios = require('axios');
const fs = require('fs');
const path = require('path');

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const OMDB_API_KEY = process.env.OMDB_API_KEY;

// Lista fixa atual do mcuData.js
const currentMcuData = require('../src/mcuData');

// Função para buscar novos lançamentos da MCU no TMDB
async function fetchNewMcuReleases() {
  const upcomingMoviesUrl = `https://api.themoviedb.org/3/movie/upcoming?api_key=${TMDB_API_KEY}&language=en-US&page=1`;
  const upcomingSeriesUrl = `https://api.themoviedb.org/3/tv/upcoming?api_key=${TMDB_API_KEY}&language=en-US&page=1`;

  const [moviesRes, seriesRes] = await Promise.all([
    axios.get(upcomingMoviesUrl).catch(() => ({ data: { results: [] } })),
    axios.get(upcomingSeriesUrl).catch(() => ({ data: { results: [] } }))
  ]);

  const upcomingMovies = moviesRes.data.results.filter(item => item.title.includes('Marvel'));
  const upcomingSeries = seriesRes.data.results.filter(item => item.name.includes('Marvel'));

  return [...upcomingMovies.map(item => ({ ...item, type: 'movie' })), ...upcomingSeries.map(item => ({ ...item, type: 'series' }))];
}

// Função para obter o IMDb ID a partir do TMDB ID
async function getImdbId(tmdbId, type) {
  const url = `https://api.themoviedb.org/3/${type}/${tmdbId}/external_ids?api_key=${TMDB_API_KEY}`;
  const res = await axios.get(url).catch(() => ({}));
  return res.data?.imdb_id || null;
}

// Atualizar o mcuData.js
async function updateMcuData() {
  console.log('Fetching new MCU releases...');
  const newReleases = await fetchNewMcuReleases();

  const updatedMcuData = [...currentMcuData];

  for (const release of newReleases) {
    const existing = updatedMcuData.find(item => item.imdbId === release.imdb_id);
    if (!existing) {
      const imdbId = await getImdbId(release.id, release.type);
      if (imdbId) {
        const omdbUrl = `http://www.omdbapi.com/?i=${imdbId}&apikey=${OMDB_API_KEY}`;
        const omdbRes = await axios.get(omdbUrl).catch(() => ({}));
        const releaseYear = omdbRes.data?.Year || release.release_date?.split('-')[0] || 'TBD';

        updatedMcuData.push({
          title: release.title || release.name,
          type: release.type,
          imdbId: imdbId,
          releaseYear: releaseYear
        });
        console.log(`Added new release: ${release.title || release.name} (${imdbId})`);
      }
    }
  }

  // Escrever o arquivo atualizado
  const fileContent = `module.exports = ${JSON.stringify(updatedMcuData, null, 2)};\n`;
  fs.writeFileSync(path.join(__dirname, '../src/mcuData.js'), fileContent, 'utf8');
  console.log('mcuData.js updated successfully');
}

updateMcuData().catch(err => {
  console.error('Error updating MCU data:', err);
  process.exit(1);
});
