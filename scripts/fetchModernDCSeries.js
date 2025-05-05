require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// --- Configuration ---
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const OMDB_API_KEY = process.env.OMDB_API_KEY; // Optional
const animationGenreId = 16; // TMDb Genre ID for Animation

const outputDCSeriesPath = path.join(__dirname, '../Data/DCSeries.js'); // Output file name

// --- List of Specific Modern DC Series to Fetch ---
// Format: { title: "Series Title", year: StartYYYY }
const seriesToFetch = [
    // Arrowverse
    { title: "Arrow", year: 2012 },
    { title: "The Flash", year: 2014 },
    { title: "Supergirl", year: 2015 },
    { title: "Legends of Tomorrow", year: 2016 }, // Or "DC's Legends of Tomorrow"
    { title: "Batwoman", year: 2019 },
    { title: "Black Lightning", year: 2018 },
    { title: "Stargirl", year: 2020 }, // Or "DC's Stargirl"
    { title: "Superman & Lois", year: 2021 },
    // Other Live-Action Series
    { title: "Gotham", year: 2014 },
    { title: "Lucifer", year: 2016 },
    { title: "Titans", year: 2018 },
    { title: "Doom Patrol", year: 2019 },
    { title: "Swamp Thing", year: 2019 },
    { title: "Pennyworth", year: 2019 },
    { title: "Watchmen", year: 2019 },
    { title: "The Sandman", year: 2022 },
    { title: "Peacemaker", year: 2022 },
    { title: "Gotham Knights", year: 2023 },
    // Upcoming (Included for completeness, but will likely be filtered out if animated or lacking metadata)
    // { title: "Creature Commandos", year: 2024 }, // Animated - Will be filtered out
    { title: "Waller", year: 2025 }, // Placeholder
    { title: "Lanterns", year: 2026 }, // Placeholder
    { title: "Paradise Lost", year: 2026 }, // Placeholder, approximate year
    { title: "Booster Gold", year: 2026 }, // Placeholder, approximate year
];


// --- Helper Functions (Copied from fetchSeriesList.js) ---

async function searchTmdbSeries(title, year) {
    const url = `https://api.themoviedb.org/3/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}&first_air_date_year=${year}&language=en-US`;
    try {
        console.log(`   Searching TMDb for TV: "${title}" (First air year: ${year})`);
        const res = await axios.get(url);
        if (res.data && res.data.results && res.data.results.length > 0) {
            const exactMatch = res.data.results.find(r => r.name.toLowerCase() === title.toLowerCase());
            if (exactMatch) {
                console.log(`   Found TMDb ID (Exact Match): ${exactMatch.id} for "${exactMatch.name}"`);
                return exactMatch.id;
            }
            console.log(`   Found TMDb ID (First Result): ${res.data.results[0].id} for "${res.data.results[0].name}"`);
            return res.data.results[0].id;
        }
    } catch (error) {
        console.error(`   ⚠️ TMDb search error (with year) for TV "${title}" (${year}): ${error.message}`);
    }

    // Try without year if search with year fails
    const urlNoYear = `https://api.themoviedb.org/3/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}&language=en-US`;
    try {
        console.log(`   Retrying search without year for TV: "${title}"`);
        const resNoYear = await axios.get(urlNoYear);
        if (resNoYear.data && resNoYear.data.results && resNoYear.data.results.length > 0) {
             const matchingYearResult = resNoYear.data.results.find(r => r.first_air_date && r.first_air_date.startsWith(year.toString()));
             if (matchingYearResult) {
                  console.log(`   Found TMDb ID (no year search, year match): ${matchingYearResult.id} for "${matchingYearResult.name}"`);
                  return matchingYearResult.id;
             }
             const fallbackResult = resNoYear.data.results[0];
             console.log(`   Found TMDb ID (no year search, fallback): ${fallbackResult.id} for "${fallbackResult.name}"`);
             return fallbackResult.id;
        }
    } catch (error) {
         console.error(`   ❌ TMDb search error (no year) for TV "${title}": ${error.message}`);
         return null;
    }

    console.warn(`   ⚠️ TMDb search warning: No results found for TV "${title}" (with or without year)`);
    return null;
}

async function getTmdbDetails(id) {
    const url = `https://api.themoviedb.org/3/tv/${id}?api_key=${TMDB_API_KEY}&language=en-US&append_to_response=external_ids,genres`;
    try {
        const res = await axios.get(url);
        return res?.data || null;
    } catch (error) {
        console.warn(`   ⚠️ TMDb fetch warning for tv/${id}: ${error.message}`);
        return null;
    }
}

async function getOmdbDetails(imdbId) {
    if (!imdbId || !OMDB_API_KEY) return null;
    const url = `https://www.omdbapi.com/?i=${imdbId}&apikey=${OMDB_API_KEY}`;
    try {
        const res = await axios.get(url);
        if (res.data && res.data.Response === 'False') {
            return null;
        }
        return res?.data || null;
    } catch (error) {
        return null;
    }
}

function writeDataFile(filePath, data) {
    const fileContent = `module.exports = ${JSON.stringify(data, null, 2)};\n`;
    try {
        fs.writeFileSync(filePath, fileContent, 'utf8');
        console.log(`\n✅ Successfully wrote ${data.length} live-action DC series items with required metadata to ${path.basename(filePath)}`); // Updated log
    } catch (error) {
        console.error(`\n❌ Error writing live-action DC series data to ${path.basename(filePath)}: ${error.message}`); // Updated log
    }
}

function sortByFirstAirYear(a, b) {
    const yearA = parseInt(a.releaseYear, 10);
    const yearB = parseInt(b.releaseYear, 10);
    if (isNaN(yearA) && isNaN(yearB)) return 0;
    if (isNaN(yearA)) return 1;
    if (isNaN(yearB)) return -1;
    return yearA - yearB;
}

// --- Main Fetch Function ---

async function fetchModernDCSeries() {
    console.log('🚀 Starting modern DC live-action series data fetching process...');
    const finalSeriesData = [];
    let processedCount = 0;

    for (const series of seriesToFetch) {
        processedCount++;
        console.log(`\nProcessing series ${processedCount}/${seriesToFetch.length}: "${series.title}" (${series.year})...`);

        const tmdbId = await searchTmdbSeries(series.title, series.year);
        if (!tmdbId) {
            console.warn(`   Skipping "${series.title}" (${series.year}) - Could not find TMDb ID.`);
            continue;
        }

        const details = await getTmdbDetails(tmdbId);
        if (!details) {
            console.warn(`   Skipping "${series.title}" (${series.year}) - Could not fetch TMDb details for ID ${tmdbId}.`);
            continue;
        }

        // Filter for essential metadata
        if (!details.poster_path || !details.overview || details.overview.trim() === '') {
            console.warn(`   Skipping "${details.name || series.title}" (${details.first_air_date?.split('-')[0] || series.year}) - Missing poster or overview.`);
            continue;
        }

        // Filter out animated series
        const genres = details.genres || [];
        const isAnimated = genres.some(g => g && g.id === animationGenreId);
        if (isAnimated) {
            console.log(`   Skipping "${details.name || series.title}" because it is animated.`);
            continue;
        }

        const title = (details.name || series.title).trim();
        const releaseYear = (details.first_air_date || series.year.toString() || 'TBD').split('-')[0];
        const imdbId = details.external_ids?.imdb_id || null;
        const poster = `https://image.tmdb.org/t/p/w500${details.poster_path}`;
        const overview = details.overview;

        const omdbDetails = await getOmdbDetails(imdbId);
        const ratings = omdbDetails?.Ratings || [];

        finalSeriesData.push({
            tmdbId: tmdbId,
            title,
            type: 'series',
            imdbId: imdbId || `tmdb_${tmdbId}`,
            id: `dc_${imdbId || 'tmdb_' + tmdbId}`,
            releaseYear,
            poster,
            ratings,
            genres, // Keep genres even though we filter by animation
            overview
        });
        console.log(`   Successfully processed "${title}" (Live-Action) with required metadata.`);
    }

    finalSeriesData.sort(sortByFirstAirYear);
    writeDataFile(outputDCSeriesPath, finalSeriesData);
    console.log('\n✨ Specific modern DC live-action series data fetching complete!');
}

// --- Run Script ---

fetchModernDCSeries().catch(err => {
    console.error('❌ Critical error during script execution:', err);
    process.exit(1);
}); 