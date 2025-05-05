require('dotenv').config();

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// --- Configuration ---
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const OMDB_API_KEY = process.env.OMDB_API_KEY;
const DC_COMPANY_IDS = '9993|128064|184898|2785|174|849'; // IDs for DC Comics, DC Entertainment, DC Studios, Warner Bros. Animation, Warner Bros. Pictures, DC Comics (alt?)
const animationGenreId = 16; // TMDb Genre ID for Animation

const outputAllDataPath = path.join(__dirname, '../Data/Data.js');
const outputMoviesPath = path.join(__dirname, '../Data/moviesData.js');
const outputAnimationsPath = path.join(__dirname, '../Data/animationsData.js');
const outputReleaseDataPath = path.join(__dirname, '../Data/releaseData.js');
const outputSeriesDataPath = path.join(__dirname, '../Data/seriesData.js');

// --- Helper Functions ---

async function getTmdbDetails(id, type) {
    const url = `https://api.themoviedb.org/3/${type}/${id}?api_key=${TMDB_API_KEY}&language=en-US&append_to_response=external_ids`;
    try {
        const res = await axios.get(url);
        return res?.data || null;
    } catch (error) {
        console.warn(`⚠️ TMDb fetch warning for ${type}/${id}: ${error.message}`);
        return null;
    }
}

async function getOmdbDetails(imdbId) {
    if (!imdbId) return null;
    const url = `https://www.omdbapi.com/?i=${imdbId}&apikey=${OMDB_API_KEY}`;
    try {
        const res = await axios.get(url);
        return res?.data || null;
    } catch (error) {
        // console.warn(`⚠️ OMDb fetch warning for ${imdbId}: ${error.message}`); // Commented out to reduce noise
        return null;
    }
}

async function fetchAllPages(url) {
    let page = 1;
    let totalPages = 1;
    const results = [];
    console.log(`   Fetching from ${url}&page=...`);
    do {
        try {
            const response = await axios.get(`${url}&page=${page}`);
            if (response && response.data) {
                results.push(...response.data.results);
                totalPages = response.data.total_pages || 1;
                if (page === 1) { // Only log total pages once per URL
                   console.log(`   Found ${totalPages} total pages for this source.`);
                }
            }
        } catch (error) {
            console.warn(`   ⚠️ Error fetching page ${page} from ${url}: ${error.message}`);
            // Decide if you want to break or continue on error
            // break; // Option: Stop fetching for this source if one page fails
        }
        page++;
    } while (page <= totalPages); // Remove the safety limit
    console.log(`   Finished fetching. Got ${results.length} raw items from this source.`);
    return results;
}

/**
 * Checks if an item has the Animation genre.
 * @param {object} item - The item to check.
 * @returns {boolean} True if the item has the Animation genre, false otherwise.
 */
function isAnimation(item) {
    // Check if genres array exists and includes the animation genre ID
    return item.genres && Array.isArray(item.genres) && item.genres.some(genre => genre && genre.id === animationGenreId);
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

/**
 * Writes data to a file, handling errors.
 * @param {string} filePath - Path to the output file.
 * @param {Array} data - The data array to write.
 * @param {string} dataType - Name of the data type for logging (e.g., 'all', 'movies').
 */
function writeDataFile(filePath, data, dataType) {
    const fileContent = `module.exports = ${JSON.stringify(data, null, 2)};\n`;
    try {
        fs.writeFileSync(filePath, fileContent, 'utf8');
        console.log(`✅ Successfully wrote ${data.length} ${dataType} items to ${path.basename(filePath)}`);
    } catch (error) {
        console.error(`❌ Error writing ${dataType} data to ${path.basename(filePath)}:`, error.message);
        // Decide if you want to stop the whole script on write error
        // process.exit(1);
    }
}

// --- Main Update Function ---

async function updateAndGenerateData() {
    console.log('🚀 Starting data update and generation process (Animations only?)...');

    // 1. Fetch Raw Data
    // console.log('🔄 Fetching new releases from DC...'); // Commented out movie fetch
    // const movieUrl = `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_API_KEY}&language=en-US&with_companies=${DC_COMPANY_IDS}&sort_by=release_date.asc`; // Removed
    // console.log('🔄 Fetching new series from DC...'); // Commented out series fetch
    // const tvUrl = `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&language=en-US&with_companies=${DC_COMPANY_IDS}&sort_by=first_air_date.asc`; // Removed

    // const rawMovies = await fetchAllPages(movieUrl); // Removed
    // const rawSeries = await fetchAllPages(tvUrl); // Removed

    // Adjust rawReleases - now empty as both movie/series fetches are removed
    const rawReleases = [
        // ...rawMovies.map(i => ({ ...i, fetched_type: 'movie' })), // Removed
        // ...rawSeries.map(i => ({ ...i, fetched_type: 'tv' })) // Removed
    ];
    // console.log(`Total raw series items fetched: ${rawReleases.length}`); // Commented out as it's 0
    console.log('⚠️ No initial items fetched as movie/series discovery is disabled.'); // Added warning

    // 2. Filter by Year and Fetch Details
    console.log('🔄 Filtering by year (>= 1960) and fetching details... (Will process 0 items)');
    const detailedData = [];
    let count = 0;
    for (const release of rawReleases) {
        const year = (release.release_date || release.first_air_date || '0').split('-')[0];
        if (parseInt(year, 10) >= 1960) {
            count++;
            process.stdout.write(`   Processing item ${count}/${rawReleases.length}...\r`);
            const details = await getTmdbDetails(release.id, release.fetched_type);
            if (!details) {
                console.log(`\n   Skipping item ${release.id} (${release.fetched_type}) due to missing details.`);
                continue;
            }

            // --- Filter: Check if core DC company is listed in production companies --- 
            const coreDcIds = [9993, 128064, 184898, 849];
            const productionCompanies = details.production_companies || [];
            const isCoreDc = productionCompanies.some(company => company && coreDcIds.includes(company.id));

            if (!isCoreDc) {
                 // console.log(`\n   Skipping item ${release.id} (${details.title || details.name}) - Not tagged with a core DC production company.`); // Optional: for debugging
                continue; // Skip if not produced by a core DC company
            }
            // --- End Filter ---

            const title = (details.title || details.name || '').trim();
            const releaseYear = (details.release_date || details.first_air_date || 'TBD').split('-')[0];
            const imdbId = details.external_ids?.imdb_id || `tmdb_${release.id}`; // Fallback if no IMDb ID
            const poster = details.poster_path ? `https://image.tmdb.org/t/p/w500${details.poster_path}` : null;
            const genres = details.genres || []; // Extract genres

            // Fetch additional info from OMDb
            const omdbDetails = await getOmdbDetails(imdbId);
            const ratings = omdbDetails?.Ratings || [];

            detailedData.push({
                tmdbId: release.id,
                title,
                type: release.fetched_type === 'tv' ? 'series' : 'movie',
                imdbId,
                id: `dc_${imdbId}`,
                releaseYear,
                poster,
                ratings,
                genres // Add genres
            });
        }
    }
    process.stdout.write('\n'); // Clear the progress line
    console.log(`✅ Finished fetching details. ${detailedData.length} items meet criteria.`);

    // 3. Write All Data (unsorted)
    writeDataFile(outputAllDataPath, detailedData, 'all');

    // 4. Filter, Sort, and Write Release Order Data (Non-Animated)
    console.log('🔄 Processing release order data (excluding animations)... ');
    const releaseOrderData = detailedData
        .filter(item => !isAnimation(item)) // Filter out animations first
        .sort(sortByReleaseYear);
    writeDataFile(outputReleaseDataPath, releaseOrderData, 'non-animated release order');

    // 5. Filter, Sort, and Write Non-Animated Movies (Renumbered) - REMOVED
    // console.log('🔄 Processing non-animated movies...');
    // const nonAnimatedMovies = detailedData
    //     .filter(item => item.type === 'movie' && !isAnimation(item))
    //     .sort(sortByReleaseYear);
    // writeDataFile(outputMoviesPath, nonAnimatedMovies, 'non-animated movies');

    // 6. Filter, Sort, and Write Animations (Renumbered)
    console.log('🔄 Processing animations...');
    const animations = detailedData
        .filter(item => isAnimation(item))
        .sort(sortByReleaseYear);
    writeDataFile(outputAnimationsPath, animations, 'animations');

    // 7. Filter, Sort, and Write Series (Non-Animated) - REMOVED
    // console.log('🔄 Processing non-animated series data...');
    // const seriesOnly = detailedData
    //     .filter(item => item.type === 'series' && !isAnimation(item))
    //     .sort(sortByReleaseYear);
    // writeDataFile(outputSeriesDataPath, seriesOnly, 'non-animated series');

    console.log('✨ Data update and generation complete!');
}

// --- Run Script ---

updateAndGenerateData().catch(err => {
    console.error('❌ Critical error during script execution:', err);
    process.exit(1);
});
