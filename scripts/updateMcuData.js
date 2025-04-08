const axios = require('axios');
const fs = require('fs');
const path = require('path');

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const OMDB_API_KEY = process.env.OMDB_API_KEY;

// Lista fixa atual do mcuData.js
const currentMcuData = require('../src/mcuData');

// Palavras-chave específicas para identificar itens da MCU
const mcuKeywords = [
  'Captain America', 'Captain Marvel', 'Iron Man', 'Thor', 'Avengers', 'Guardians of the Galaxy',
  'Ant-Man', 'Black Panther', 'Doctor Strange', 'Spider-Man', 'Black Widow', 'Shang-Chi', 'Eternals',
  'Loki', 'What If', 'WandaVision', 'Falcon and the Winter Soldier', 'Hawkeye', 'Moon Knight',
  'Ms. Marvel', 'She-Hulk', 'Werewolf by Night', 'Guardians of the Galaxy Holiday Special',
  'Secret Invasion', 'The Marvels', 'Echo', 'Deadpool & Wolverine', 'Agatha All Along',
  'Daredevil: Born Again', 'Thunderbolts', 'The Fantastic Four', 'Blade', 'Ironheart'
];

// Função para buscar novos lançamentos da MCU no TMDB
async function fetchNewMcuReleases() {
  const upcomingMoviesUrl = `https://api.themoviedb.org/3/movie/upcoming?api_key=${TMDB_API_KEY}&language=en-US&page=1`;
  const upcomingSeriesUrl = `https://api.themoviedb.org/3/tv/upcoming?api_key=${TMDB_API_KEY}&language=en-US&page=1`;

  const [moviesRes, seriesRes] = await Promise.all([
    axios.get(upcomingMoviesUrl).catch(() => ({ data: { results: [] } })),
    axios.get(upcomingSeriesUrl).catch(() => ({ data: { results: [] } }))
  ]);

  const upcomingMovies = moviesRes.data.results.filter(item =>
    mcuKeywords.some(keyword => item.title?.includes(keyword))
  );
  const upcomingSeries = seriesRes.data.results.filter(item =>
    mcuKeywords.some(keyword => item.name?.includes(keyword))
  );

  return [...upcomingMovies.map(item => ({ ...item, type: 'movie' })), ...upcomingSeries.map(item => ({ ...item, type: 'series' }))];
}

// Função para obter o IMDb ID a partir do título e ano no OMDB
async function getImdbId(title, year) {
  const omdbUrl = `http://www.omdbapi.com/?t=${encodeURIComponent(title)}&y=${year}&apikey=${OMDB_API_KEY}`;
  const res = await axios.get(omdbUrl).catch(() => ({}));
  return res.data?.imdbID || null;
}

// Atualizar o mcuData.js
async function updateMcuData() {
  console.log('Fetching new MCU releases...');
  const newReleases = await fetchNewMcuReleases();

  const updatedMcuData = [...currentMcuData];

  for (const release of newReleases) {
    const title = release.title || release.name;
    const releaseYear = release.release_date?.split('-')[0] || release.first_air_date?.split('-')[0] || 'TBD';
    const existing = updatedMcuData.find(item => item.title === title && item.releaseYear === releaseYear);

    if (!existing) {
      const imdbId = await getImdbId(title, releaseYear);
      if (imdbId) {
        updatedMcuData.push({
          title: title,
          type: release.type,
          imdbId: imdbId,
          releaseYear: releaseYear
        });
        console.log(`Added new release: ${title} (${imdbId})`);
      } else {
        console.warn(`Could not find IMDb ID for ${title} (${releaseYear})`);
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
