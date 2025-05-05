require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// --- Configuration ---
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const OMDB_API_KEY = process.env.OMDB_API_KEY; // Optional, will fetch ratings if key is valid

const outputSupermanPath = path.join(__dirname, '../Data/everythingsuperman.js'); // Output file name

// --- List of Specific Superman Movies to Fetch ---
// Format: { title: "Movie Title", year: YYYY }
const moviesToFetch = [
    // Classic Serials & Early Films
    { title: "Superman", year: 1948 },
    { title: "Atom Man vs. Superman", year: 1950 },
    { title: "Superman and the Mole Men", year: 1951 },
    // Christopher Reeve Era
    { title: "Superman", year: 1978 }, // Note: Duplicate title/year might require manual check if search fails
    { title: "Superman II", year: 1980 },
    { title: "Superman III", year: 1983 },
    { title: "Superman IV: The Quest for Peace", year: 1987 },
    // Standalone Films
    { title: "Superman Returns", year: 2006 },
    // DC Extended Universe (DCEU)
    { title: "Man of Steel", year: 2013 },
    { title: "Batman v Superman: Dawn of Justice", year: 2016 }, // Features Superman
    { title: "Justice League", year: 2017 }, // Features Superman
    { title: "Zack Snyder's Justice League", year: 2021 }, // Features Superman
    // Upcoming Superman Films
    { title: "Superman", year: 2025 }, // James Gunn version
];


// --- Helper Functions (Mostly Identical to previous scripts) ---

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
            console.log(`   Found TMDb ID (First Result): ${res.data.results[0].id} for "${res.data.results[0].title}"`);
            return res.data.results[0].id;
        }
    } catch (error) {
        console.error(`   ⚠️ TMDb search error (with year) for "${title}" (${year}): ${error.message}`);
        // Continue to try without year
    }

    // If search with year fails or returns no results, try without year
    const urlNoYear = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}&language=en-US`;
    try {
        console.log(`   Retrying search without year for: "${title}"`);
        const resNoYear = await axios.get(urlNoYear);
        if (resNoYear.data && resNoYear.data.results && resNoYear.data.results.length > 0) {
            // Try to find one with a matching year if possible
            const matchingYearResult = resNoYear.data.results.find(r => r.release_date && r.release_date.startsWith(year.toString()));
            if (matchingYearResult) {
                console.log(`   Found TMDb ID (no year search, year match): ${matchingYearResult.id} for "${matchingYearResult.title}"`);
                return matchingYearResult.id;
            }
            // Fallback to the absolute first result if no year match
            const fallbackResult = resNoYear.data.results[0];
            console.log(`   Found TMDb ID (no year search, fallback): ${fallbackResult.id} for "${fallbackResult.title}"`);
            return fallbackResult.id;
        }
    } catch (error) {
         console.error(`   ❌ TMDb search error (no year) for "${title}": ${error.message}`);
         return null;
    }

    // If both searches fail
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
             // console.warn(`   ⚠️ OMDb fetch warning for ${imdbId}: ${res.data.Error || 'API returned False'}`);
             return null;
         }
        return res?.data || null;
    } catch (error) {
        // console.warn(`   ⚠️ OMDb fetch warning for ${imdbId}: ${error.message}`);
        return null;
    }
}

/**
 * Writes data to a file, handling errors.
 * @param {string} filePath - Path to the output file.
 * @param {Array} data - The data array to write.
 */
function writeDataFile(filePath, data) {
    const fileContent = `module.exports = ${JSON.stringify(data, null, 2)};\n`;
    try {
        fs.writeFileSync(filePath, fileContent, 'utf8');
        console.log(`\n✅ Successfully wrote ${data.length} Superman movie items with required metadata to ${path.basename(filePath)}`); // Updated log
    } catch (error) {
        console.error(`\n❌ Error writing Superman movie data to ${path.basename(filePath)}: ${error.message}`); // Updated log
    }
}

/**
 * Sorts items by release year (ascending). Handles 'TBD' or invalid years.
 * @param {object} a - First item for comparison.
 * @param {object} b - Second item for comparison.
 * @returns {number} Sorting order.
 */
function sortByReleaseYear(a, b) {
    const yearA = parseInt(a.releaseYear, 10);
    const yearB = parseInt(b.releaseYear, 10);

    if (isNaN(yearA) && isNaN(yearB)) return 0;
    if (isNaN(yearA)) return 1;
    if (isNaN(yearB)) return -1;

    return yearA - yearB;
}


// --- Main Fetch Function ---

async function fetchSpecificSupermanMovies() {
    console.log('🚀 Starting specific Superman movie data fetching process...');
    const finalMovieData = [];
    let processedCount = 0;

    for (const movie of moviesToFetch) {
        processedCount++;
        console.log(`\nProcessing Superman movie ${processedCount}/${moviesToFetch.length}: "${movie.title}" (${movie.year})...`);

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

        // --- Filter: Check for essential metadata --- 
        if (!details.poster_path) {
            console.warn(`   Skipping "${details.title || movie.title}" (${details.release_date?.split('-')[0] || movie.year}) - Missing poster image.`);
            continue;
        }
        if (!details.overview || details.overview.trim() === '') {
             console.warn(`   Skipping "${details.title || movie.title}" (${details.release_date?.split('-')[0] || movie.year}) - Missing description/overview.`);
             continue;
        }
        // --- End Filter ---

        const title = (details.title || details.name || movie.title).trim();
        const releaseYear = (details.release_date || movie.year.toString() || 'TBD').split('-')[0];
        const imdbId = details.external_ids?.imdb_id || null;
        const poster = details.poster_path ? `https://image.tmdb.org/t/p/w500${details.poster_path}` : null;
        const genres = details.genres || [];

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
            overview: details.overview
        });
        console.log(`   Successfully processed "${title}" with required metadata.`);
    }

    // Sort the final list by release year
    finalMovieData.sort(sortByReleaseYear);

    // Write the collected data to the output file
    writeDataFile(outputSupermanPath, finalMovieData);

    console.log('\n✨ Specific Superman movie data fetching complete!');
}

// --- Run Script ---

fetchSpecificSupermanMovies().catch(err => {
    console.error('❌ Critical error during script execution:', err);
    process.exit(1);
}); 