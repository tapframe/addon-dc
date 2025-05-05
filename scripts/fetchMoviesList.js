require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// --- Configuration ---
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const OMDB_API_KEY = process.env.OMDB_API_KEY; // Optional, will fetch ratings if key is valid

const outputMoviesPath = path.join(__dirname, '../Data/moviesData.js');

// --- List of Specific Movies to Fetch ---
// Format: { title: "Movie Title", year: YYYY }
const moviesToFetch = [
    // Classic DC Films (Pre-DCEU)
    { title: "Superman", year: 1978 },
    { title: "Superman II", year: 1980 },
    { title: "Superman III", year: 1983 },
    { title: "Superman IV: The Quest for Peace", year: 1987 },
    { title: "Superman Returns", year: 2006 },
    { title: "Batman", year: 1989 },
    { title: "Batman Returns", year: 1992 },
    { title: "Batman Forever", year: 1995 },
    { title: "Batman & Robin", year: 1997 },
    { title: "Batman Begins", year: 2005 },
    { title: "The Dark Knight", year: 2008 },
    { title: "The Dark Knight Rises", year: 2012 },
    { title: "Steel", year: 1997 },
    { title: "Catwoman", year: 2004 },
    { title: "Constantine", year: 2005 },
    { title: "Watchmen", year: 2009 },
    { title: "Jonah Hex", year: 2010 },
    { title: "Green Lantern", year: 2011 },
    // DC Extended Universe (DCEU) – 2013 to 2023
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
    // Standalone & Elseworlds Films
    { title: "Joker", year: 2019 },
    { title: "The Batman", year: 2022 },
    // Upcoming DC Films (Post-DCEU) - Note: Details might be limited for unreleased films
    { title: "Joker: Folie à Deux", year: 2024 },
    // { title: "Superman: Legacy", year: 2025 }, // Title might change, search may fail
    { title: "Superman", year: 2025 }, // Using generic 'Superman' for 2025 search as 'Legacy' might not be final/searchable yet
    { title: "The Batman: Part II", year: 2025 },
];


// --- Helper Functions ---

async function searchTmdbMovie(title, year) {
    const url = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}&primary_release_year=${year}&language=en-US`;
    try {
        console.log(`   Searching TMDb for: "${title}" (${year})`);
        const res = await axios.get(url);
        if (res.data && res.data.results && res.data.results.length > 0) {
            // Basic heuristic: Assume the first result is the most likely match
            // More complex matching could be added if needed (e.g., comparing titles more closely)
            console.log(`   Found TMDb ID: ${res.data.results[0].id}`);
            return res.data.results[0].id;
        } else {
            console.warn(`   ⚠️ TMDb search warning: No results found for "${title}" (${year})`);
            return null;
        }
    } catch (error) {
        console.error(`   ❌ TMDb search error for "${title}" (${year}): ${error.message}`);
        return null;
    }
}


async function getTmdbDetails(id) {
    const url = `https://api.themoviedb.org/3/movie/${id}?api_key=${TMDB_API_KEY}&language=en-US&append_to_response=external_ids`;
    try {
        const res = await axios.get(url);
        return res?.data || null;
    } catch (error) {
        console.warn(`   ⚠️ TMDb fetch warning for movie/${id}: ${error.message}`);
        return null;
    }
}

async function getOmdbDetails(imdbId) {
    if (!imdbId || !OMDB_API_KEY) return null; // Skip if no ID or no OMDb key
    const url = `https://www.omdbapi.com/?i=${imdbId}&apikey=${OMDB_API_KEY}`;
    try {
        const res = await axios.get(url);
         if (res.data && res.data.Response === 'False') {
             // console.warn(`   ⚠️ OMDb fetch warning for ${imdbId}: ${res.data.Error || 'API returned False'}`); // Optional: Log OMDb specific errors
             return null;
         }
        return res?.data || null;
    } catch (error) {
        // console.warn(`   ⚠️ OMDb fetch warning for ${imdbId}: ${error.message}`); // Keep commented unless debugging key issues
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
        console.log(`\n✅ Successfully wrote ${data.length} movie items with required metadata to ${path.basename(filePath)}`);
    } catch (error) {
        console.error(`\n❌ Error writing movie data to ${path.basename(filePath)}: ${error.message}`);
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

    // Handle cases where year might be 'TBD' or NaN
    if (isNaN(yearA) && isNaN(yearB)) return 0;
    if (isNaN(yearA)) return 1; // Put items without a valid year at the end
    if (isNaN(yearB)) return -1; // Keep items with a valid year before those without

    return yearA - yearB;
}


// --- Main Fetch Function ---

async function fetchSpecificMovies() {
    console.log('🚀 Starting specific movie data fetching process...');
    const finalMovieData = [];
    let processedCount = 0;

    for (const movie of moviesToFetch) {
        processedCount++;
        console.log(`\nProcessing movie ${processedCount}/${moviesToFetch.length}: "${movie.title}" (${movie.year})...`);

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
            console.warn(`   Skipping "${movie.title}" (${movie.year}) - Missing poster image.`);
            continue;
        }
        if (!details.overview || details.overview.trim() === '') {
             console.warn(`   Skipping "${movie.title}" (${movie.year}) - Missing description/overview.`);
             continue;
        }
        // --- End Filter ---

        const title = (details.title || details.name || movie.title).trim(); // Fallback to original title
        const releaseYear = (details.release_date || movie.year.toString() || 'TBD').split('-')[0]; // Use original year if TMDB missing
        const imdbId = details.external_ids?.imdb_id || null; // Can be null
        const poster = details.poster_path ? `https://image.tmdb.org/t/p/w500${details.poster_path}` : null;
        const genres = details.genres || [];

        // Fetch additional info from OMDb (only if key provided and IMDb ID exists)
        const omdbDetails = await getOmdbDetails(imdbId);
        const ratings = omdbDetails?.Ratings || []; // Default to empty array if no details/ratings

        finalMovieData.push({
            tmdbId: tmdbId,
            title,
            type: 'movie', // Explicitly set type
            imdbId: imdbId || `tmdb_${tmdbId}`,
            id: `dc_${imdbId || 'tmdb_' + tmdbId}`,
            releaseYear,
            poster,
            ratings,
            genres
        });
        console.log(`   Successfully processed "${title}" with required metadata.`);
    }

    // Sort the final list by release year
    finalMovieData.sort(sortByReleaseYear);

    // Write the collected data to the output file
    writeDataFile(outputMoviesPath, finalMovieData);

    console.log('\n✨ Specific movie data fetching complete!');
}

// --- Run Script ---

fetchSpecificMovies().catch(err => {
    console.error('❌ Critical error during script execution:', err);
    process.exit(1);
}); 