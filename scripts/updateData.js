const axios = require('axios');
const fs = require('fs');
const path = require('path');

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const OMDB_API_KEY = process.env.OMDB_API_KEY;

// ID da Marvel Studios no TMDb
const MARVEL_COMPANY_ID = 420;

async function getTmdbDetails(id, type) {
  const url = `https://api.themoviedb.org/3/${type}/${id}?api_key=${TMDB_API_KEY}&language=en-US&append_to_response=external_ids`;
  const res = await axios.get(url).catch(() => null);
  return res?.data || null;
}

async function getOmdbDetails(imdbId) {
  if (!imdbId) return null;
  const url = `https://www.omdbapi.com/?i=${imdbId}&apikey=${OMDB_API_KEY}`;
  const res = await axios.get(url).catch(() => null);
  return res?.data || null;
}

async function fetchAllPages(url) {
  let page = 1;
  let totalPages = 1;
  const results = [];

  do {
    const response = await axios.get(`${url}&page=${page}`).catch(() => null);
    if (response && response.data) {
      results.push(...response.data.results);
      totalPages = response.data.total_pages; // Total de páginas disponíveis
    }
    page++;
  } while (page <= totalPages);

  return results;
}

async function fetchNewMcuReleases() {
  console.log('🔄 Buscando novos lançamentos da Marvel Studios...');

  // URLs para buscar filmes e séries da Marvel Studios
  const movieUrl = `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_API_KEY}&language=en-US&with_companies=${MARVEL_COMPANY_ID}&sort_by=release_date.asc`;
  const tvUrl = `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&language=en-US&with_companies=${MARVEL_COMPANY_ID}&sort_by=first_air_date.asc`;

  // Busca todos os filmes e séries usando paginação
  const movies = await fetchAllPages(movieUrl);
  const series = await fetchAllPages(tvUrl);

  // Processa os resultados
  const filteredMovies = movies
    .filter(movie => movie.release_date && parseInt(movie.release_date.split('-')[0]) >= 2008) // Ignora filmes antigos
    .map(i => ({ ...i, type: 'movie' }));

  const filteredSeries = series
    .filter(serie => serie.first_air_date && parseInt(serie.first_air_date.split('-')[0]) >= 2008) // Ignora séries antigas
    .map(i => ({ ...i, type: 'tv' }));

  console.log('Filmes retornados:', filteredMovies.map(m => m.title));
  console.log('Séries retornadas:', filteredSeries.map(s => s.name));

  return [...filteredMovies, ...filteredSeries];
}

async function updateData() {
  console.log('🔄 Atualizando dados do arquivo na pasta Data...');

  const newReleases = await fetchNewMcuReleases();
  const updatedData = [];

  for (const release of newReleases) {
    const title = (release.title || release.name || '').trim();
    const releaseYear = (release.release_date || release.first_air_date || 'TBD').split('-')[0];

    const details = await getTmdbDetails(release.id, release.type);
    if (!details) continue;

    const imdbId = details.external_ids?.imdb_id || `tmdb_${release.id}`;
    const poster = details.poster_path ? `https://image.tmdb.org/t/p/w500${details.poster_path}` : null;

    // Busca informações adicionais no OMDb
    const omdbDetails = await getOmdbDetails(imdbId);
    const ratings = omdbDetails?.Ratings || [];

    updatedData.push({
      title,
      type: release.type === 'tv' ? 'series' : 'movie',
      imdbId,
      id: `marvel_${imdbId}`,
      releaseYear,
      poster,
      ratings
    });

    console.log(`🆕 Adicionado novo: ${title} (${release.type})`);
  }

  // Salva os dados atualizados no arquivo Data.js
  const fileContent = `module.exports = ${JSON.stringify(updatedData, null, 2)};\n`;
  fs.writeFileSync(path.join(__dirname, '../Data/Data.js'), fileContent, 'utf8');
  console.log('✅ Data.js atualizado com sucesso!');
}

updateData().catch(err => {
  console.error('❌ Erro ao atualizar Data.js:', err);
  process.exit(1);
});
