require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// --- Configuration ---
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const OMDB_API_KEY = process.env.OMDB_API_KEY; // Optional, will fetch ratings if key is valid

const outputBatmanPath = path.join(__dirname, '../Data/everythingBatman.js'); // Output file name

// --- List of Specific Batman Movies to Fetch ---
// Format: { title: "Movie Title", year: YYYY }
const moviesToFetch = [
    // Classic Serials & Early Films
    { title: "Batman", year: 1943 },
    { title: "Batman and Robin", year: 1949 },
    { title: "Batman: The Movie", year: 1966 }, // Alt: "Batman"
    // Tim Burton / Joel Schumacher Era
    { title: "Batman", year: 1989 },
    { title: "Batman Returns", year: 1992 },
    { title: "Batman Forever", year: 1995 },
    { title: "Batman & Robin", year: 1997 },
    // The Dark Knight Trilogy (Christopher Nolan)
    { title: "Batman Begins", year: 2005 },
    { title: "The Dark Knight", year: 2008 },
    { title: "The Dark Knight Rises", year: 2012 },
    // DC Extended Universe (DCEU)
    { title: "Batman v Superman: Dawn of Justice", year: 2016 },
    { title: "Suicide Squad", year: 2016 }, // Cameo appearance
    { title: "Justice League", year: 2017 },
    { title: "Zack Snyder's Justice League", year: 2021 },
    // Standalone & Multiverse Films
    { title: "The Batman", year: 2022 },
    { title: "The Flash", year: 2023 }, // Features Batman
    // Upcoming Batman Films
    { title: "The Batman: Part II", year: 2025 },
    { title: "The Brave and the Bold", year: 2026 }, // Placeholder year, may need adjustment
];


// --- Helper Functions (Identical to fetchMoviesList.js) ---

async function searchTmdbMovie(title, year) {
    const url = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}&primary_release_year=${year}&language=en-US`;
    try {
        console.log(`   Searching TMDb for: "${title}" (${year})`);
        const res = await axios.get(url);
        if (res.data && res.data.results && res.data.results.length > 0) {
             // Try to find exact title match first
             const exactMatch = res.data.results.find(r => r.title.toLowerCase() === title.toLowerCase());
             if (exactMatch) {
                 console.log(`   Found TMDb ID (Exact Match): ${exactMatch.id}`);
                 return exactMatch.id;
             }
            // Fallback to first result if no exact match
            console.log(`   Found TMDb ID (Fallback): ${res.data.results[0].id} for "${res.data.results[0].title}"`);
            return res.data.results[0].id;
        } else {
            // Try searching without year if initial search fails (useful for upcoming/serials)
            const urlNoYear = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}&language=en-US`;
            console.log(`   Retrying search without year for: "${title}"`);
            const resNoYear = await axios.get(urlNoYear);
            if (resNoYear.data && resNoYear.data.results && resNoYear.data.results.length > 0) {
                // Try to find one with a matching year if possible
                const matchingYearResult = resNoYear.data.results.find(r => r.release_date && r.release_date.startsWith(year.toString()));
                if (matchingYearResult) {
                     console.log(`   Found TMDb ID (no year search): ${matchingYearResult.id} for "${matchingYearResult.title}"`);
                     return matchingYearResult.id;
                }
                 // Fallback to first result of no-year search
                 const fallbackResult = resNoYear.data.results[0];
                 console.log(`   Found TMDb ID (no year search, fallback): ${fallbackResult.id} for "${fallbackResult.title}"`);
                 return fallbackResult.id;
            } else {
                 console.warn(`   ⚠️ TMDb search warning: No results found for "${title}" (with or without year)`);
                 return null;
            }
        }
    } catch (error) {
        console.error(`   ❌ TMDb search error for "${title}" (${year}): ${error.message}`);
        return null;
    }
}

async function getTmdbDetails(id) {
    const url = `https://api.themoviedb.org/3/movie/${id}?api_key=${TMDB_API_KEY}&language=en-US&append_to_response=external_ids,genres`; // Added genres
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
        console.log(`\n✅ Successfully wrote ${data.length} Batman movie items with required metadata to ${path.basename(filePath)}`); // Updated log
    } catch (error) {
        console.error(`\n❌ Error writing Batman movie data to ${path.basename(filePath)}: ${error.message}`); // Updated log
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

async function fetchSpecificBatmanMovies() {
    console.log('🚀 Starting specific Batman movie data fetching process...');
    const finalMovieData = [];
    let processedCount = 0;

    for (const movie of moviesToFetch) {
        processedCount++;
        console.log(`\nProcessing Batman movie ${processedCount}/${moviesToFetch.length}: "${movie.title}" (${movie.year})...`);

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
            overview: details.overview // Add overview to the output object
        });
        console.log(`   Successfully processed "${title}" with required metadata.`);
    }

    // Sort the final list by release year
    finalMovieData.sort(sortByReleaseYear);

    // Write the collected data to the output file
    writeDataFile(outputBatmanPath, finalMovieData);

    console.log('\n✨ Specific Batman movie data fetching complete!');
}

// --- Run Script ---

fetchSpecificBatmanMovies().catch(err => {
    console.error('❌ Critical error during script execution:', err);
    process.exit(1);
}); 