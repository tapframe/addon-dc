const axios = require('axios');
const fs = require('fs');
const path = require('path');

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const currentMcuData = require('../src/mcuData');

const mcuKeywords = [
  'Captain America', 'Captain Marvel', 'Iron Man', 'Thor', 'Avengers', 'Guardians of the Galaxy',
  'Ant-Man', 'Black Panther', 'Doctor Strange', 'Spider-Man', 'Black Widow', 'Shang-Chi', 'Eternals',
  'Loki', 'What If', 'WandaVision', 'Falcon and the Winter Soldier', 'Hawkeye', 'Moon Knight',
  'Ms. Marvel', 'She-Hulk', 'Werewolf by Night', 'Guardians of the Galaxy Holiday Special',
  'Secret Invasion', 'The Marvels', 'Echo', 'Deadpool & Wolverine', 'Agatha All Along',
  'Daredevil: Born Again', 'Thunderbolts', 'The Fantastic Four', 'Blade', 'Ironheart'
];

async function getTmdbSearchResults(title, year) {
  const query = encodeURIComponent(title);
  const url = `https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}&language=en-US&query=${query}&include_adult=false`;
  const res = await axios.get(url).catch(() => null);
  if (!res || !res.data?.results) return null;

  return res.data.results.find(item => {
    const itemYear = (item.release_date || item.first_air_date || '').split('-')[0];
    return itemYear === year;
  });
}

async function getTmdbDetails(id, type) {
  const url = `https://api.themoviedb.org/3/${type}/${id}?api_key=${TMDB_API_KEY}&language=en-US&append_to_response=external_ids`;
  const res = await axios.get(url).catch(() => null);
  return res?.data || null;
}

async function fetchNewMcuReleases() {
  const urls = [
    `https://api.themoviedb.org/3/movie/upcoming?api_key=${TMDB_API_KEY}&language=en-US&page=1`,
    `https://api.themoviedb.org/3/tv/on_the_air?api_key=${TMDB_API_KEY}&language=en-US&page=1`
  ];

  const [moviesRes, seriesRes] = await Promise.all(urls.map(url => axios.get(url).catch(() => ({ data: { results: [] } }))));

  const movies = moviesRes.data.results.filter(i =>
    mcuKeywords.some(k => i.title?.includes(k))
  ).map(i => ({ ...i, type: 'movie' }));

  const series = seriesRes.data.results.filter(i =>
    mcuKeywords.some(k => i.name?.includes(k))
  ).map(i => ({ ...i, type: 'tv' }));

  return [...movies, ...series];
}

async function updateMcuData() {
  console.log('🔄 Atualizando dados do MCU...');

  const updatedMcuData = [];
  for (const item of currentMcuData) {
    let updatedItem = { ...item };

    const tmdbMatch = await getTmdbSearchResults(item.title, item.releaseYear);
    if (tmdbMatch) {
      const details = await getTmdbDetails(tmdbMatch.id, tmdbMatch.media_type);
      if (details) {
        if (!updatedItem.poster && details.poster_path) {
          updatedItem.poster = `https://image.tmdb.org/t/p/w500${details.poster_path}`;
        }
        if (!updatedItem.id && details.external_ids?.imdb_id) {
          updatedItem.id = `marvel_${details.external_ids.imdb_id}`;
        }
      }
    }

    updatedMcuData.push(updatedItem);
  }

  const newReleases = await fetchNewMcuReleases();
  for (const release of newReleases) {
    const title = release.title || release.name;
    const releaseYear = (release.release_date || release.first_air_date || 'TBD').split('-')[0];

    const exists = updatedMcuData.some(item => item.title === title && item.releaseYear === releaseYear);
    if (exists) continue;

    const details = await getTmdbDetails(release.id, release.type);
    if (!details) continue;

    const imdbId = details.external_ids?.imdb_id || `tmdb_${release.id}`;
    const poster = details.poster_path ? `https://image.tmdb.org/t/p/w500${details.poster_path}` : null;

    updatedMcuData.push({
      title,
      type: release.type === 'tv' ? 'series' : 'movie',
      imdbId,
      id: `marvel_${imdbId}`,
      releaseYear,
      poster
    });

    console.log(`🆕 Adicionado novo: ${title}`);
  }

  const fileContent = `module.exports = ${JSON.stringify(updatedMcuData, null, 2)};\n`;
  fs.writeFileSync(path.join(__dirname, '../src/mcuData.js'), fileContent, 'utf8');
  console.log('✅ mcuData.js atualizado com sucesso!');
}

updateMcuData().catch(err => {
  console.error('❌ Erro ao atualizar:', err);
  process.exit(1);
});
