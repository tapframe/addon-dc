require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// --- Configuration ---
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const OMDB_API_KEY = process.env.OMDB_API_KEY; // Optional, will fetch ratings if key is valid

const outputDceuPath = path.join(__dirname, '../Data/DCEUMovies.js'); // Output file name

// --- List of Specific DCEU Movies to Fetch ---
// Format: { title: "Movie Title", year: YYYY }
const moviesToFetch = [
    { title: "Man of Steel", year: 2013 },
    { title: "Batman v Superman: Dawn of Justice", year: 2016 },
    { title: "Suicide Squad", year: 2016 },
    { title: "Wonder Woman", year: 2017 },
    { title: "Justice League", year: 2017 },
    { title: "Aquaman", year: 2018 },
    { title: "Shazam!", year: 2019 },
    { title: "Birds of Prey", year: 2020 }, // Or Birds of Prey (and the Fantabulous Emancipation of One Harley Quinn)
    { title: "Wonder Woman 1984", year: 2020 },
    { title: "Zack Snyder's Justice League", year: 2021 },
    { title: "The Suicide Squad", year: 2021 },
    { title: "Black Adam", year: 2022 },
    { title: "Shazam! Fury of the Gods", year: 2023 },
    { title: "The Flash", year: 2023 },
    { title: "Blue Beetle", year: 2023 },
    { title: "Aquaman and the Lost Kingdom", year: 2023 },
];


// --- Helper Functions (Copied from fetchMoviesList.js / fetchBatmanMovies.js) ---

async function searchTmdbMovie(title, year) {
    // Try searching with year first
    const urlWithYear = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}&primary_release_year=${year}&language=en-US`;
    try {
        console.log(`   Searching TMDb for: "${title}" (${year})`);
        const res = await axios.get(urlWithYear);
        if (res.data && res.data.results && res.data.results.length > 0) {
            // Prefer exact title match if multiple results for the year
            const exactMatch = res.data.results.find(r => r.title.toLowerCase() === title.toLowerCase());
            if (exactMatch) {
                console.log(`   Found TMDb ID (Exact Title Match): ${exactMatch.id}`);
                return exactMatch.id;
            }
             // Special case for Birds of Prey full title
             if (title === "Birds of Prey") {
                 const fullTitleMatch = res.data.results.find(r => r.title.toLowerCase().includes("birds of prey") && r.title.toLowerCase().includes("fantabulous emancipation"));
                 if (fullTitleMatch) {
                    console.log(`   Found TMDb ID (Full Title Match): ${fullTitleMatch.id}`);
                    return fullTitleMatch.id;
                 }
             }
            console.log(`   Found TMDb ID (First Result): ${res.data.results[0].id} for "${res.data.results[0].title}"`);
            return res.data.results[0].id;
        }
    } catch (error) {
        console.error(`   ⚠️ TMDb search error (with year) for "${title}" (${year}): ${error.message}`);
    }

    // Try without year if search with year failed
    const urlNoYear = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}&language=en-US`;
    try {
        console.log(`   Retrying search without year for: "${title}"`);
        const resNoYear = await axios.get(urlNoYear);
        if (resNoYear.data && resNoYear.data.results && resNoYear.data.results.length > 0) {
            const matchingYearResult = resNoYear.data.results.find(r => r.release_date && r.release_date.startsWith(year.toString()));
            if (matchingYearResult) {
                console.log(`   Found TMDb ID (no year search, year match): ${matchingYearResult.id} for "${matchingYearResult.title}"`);
                return matchingYearResult.id;
            }
            const fallbackResult = resNoYear.data.results[0];
            console.log(`   Found TMDb ID (no year search, fallback): ${fallbackResult.id} for "${fallbackResult.title}"`);
            return fallbackResult.id;
        }
    } catch (error) {
         console.error(`   ❌ TMDb search error (no year) for "${title}": ${error.message}`);
         return null;
    }

    console.warn(`   ⚠️ TMDb search warning: No results found for "${title}" (with or without year)`);
    return null;
}

async function getTmdbDetails(id) {
    const url = `https://api.themoviedb.org/3/movie/${id}?api_key=${TMDB_API_KEY}&language=en-US&append_to_response=external_ids,genres`;
    try {
        const res = await axios.get(url);
        return res?.data || null;
    } catch (error) {
        console.warn(`   ⚠️ TMDb fetch warning for movie/${id}: ${error.message}`);
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
        console.log(`\n✅ Successfully wrote ${data.length} DCEU movie items with required metadata to ${path.basename(filePath)}`); // Updated log
    } catch (error) {
        console.error(`\n❌ Error writing DCEU movie data to ${path.basename(filePath)}: ${error.message}`); // Updated log
    }
}

function sortByReleaseYear(a, b) {
    const yearA = parseInt(a.releaseYear, 10);
    const yearB = parseInt(b.releaseYear, 10);
    if (isNaN(yearA) && isNaN(yearB)) return 0;
    if (isNaN(yearA)) return 1;
    if (isNaN(yearB)) return -1;
    return yearA - yearB;
}


// --- Main Fetch Function ---

async function fetchSpecificDceuMovies() {
    console.log('🚀 Starting specific DCEU movie data fetching process...');
    const finalMovieData = [];
    let processedCount = 0;

    for (const movie of moviesToFetch) {
        processedCount++;
        console.log(`\nProcessing DCEU movie ${processedCount}/${moviesToFetch.length}: "${movie.title}" (${movie.year})...`);

        const tmdbId = await searchTmdbMovie(movie.title, movie.year);
        if (!tmdbId) {
            console.warn(`   Skipping "${movie.title}" (${movie.year}) - Could not find TMDb ID.`);
            continue;
        }

        const details = await getTmdbDetails(tmdbId);
        if (!details) {
            console.warn(`   Skipping "${movie.title}" (${movie.year}) - Could not fetch TMDb details for ID ${tmdbId}.`);
            continue;
        }

        // Filter for essential metadata
        if (!details.poster_path || !details.overview || details.overview.trim() === '') {
            console.warn(`   Skipping "${details.title || movie.title}" (${details.release_date?.split('-')[0] || movie.year}) - Missing poster or overview.`);
            continue;
        }

        const title = (details.title || movie.title).trim();
        const releaseYear = (details.release_date || movie.year.toString() || 'TBD').split('-')[0];
        const imdbId = details.external_ids?.imdb_id || null;
        const poster = `https://image.tmdb.org/t/p/w500${details.poster_path}`;
        const genres = details.genres || [];
        const overview = details.overview;

        const omdbDetails = await getOmdbDetails(imdbId);
        const ratings = omdbDetails?.Ratings || [];

        finalMovieData.push({
            tmdbId: tmdbId,
            title,
            type: 'movie',
            imdbId: imdbId || `tmdb_${tmdbId}`,
            id: `dc_${imdbId || 'tmdb_' + tmdbId}`,
            releaseYear,
            poster,
            ratings,
            genres,
            overview
        });
        console.log(`   Successfully processed "${title}" with required metadata.`);
    }

    finalMovieData.sort(sortByReleaseYear);
    writeDataFile(outputDceuPath, finalMovieData);
    console.log('\n✨ Specific DCEU movie data fetching complete!');
}

// --- Run Script ---

fetchSpecificDceuMovies().catch(err => {
    console.error('❌ Critical error during script execution:', err);
    process.exit(1);
}); 