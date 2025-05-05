require('dotenv').config();

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// --- Configuration ---
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const OMDB_API_KEY = process.env.OMDB_API_KEY;
// Use the combined list from other scripts for consistency
const DC_COMPANY_IDS = '9993|128064|184898|2164|429|1957'; 
const WARNER_BROS_COMPANY_IDS = '174|4|8486|82495|132851|5193|80564|9996|6194'; 
const COMPANY_IDS = `${DC_COMPANY_IDS}|${WARNER_BROS_COMPANY_IDS}`; // Combine DC and Warner Bros IDs
const animationGenreId = 16; // TMDb Genre ID for Animation
const MIN_YEAR = 1950; // Keep original minimum year for this general script

const outputAllDataPath = path.join(__dirname, '../Data/Data.js');
const outputMoviesPath = path.join(__dirname, '../Data/moviesData.js');
const outputAnimationsPath = path.join(__dirname, '../Data/animationsData.js');
const outputReleaseDataPath = path.join(__dirname, '../Data/releaseData.js');
const outputSeriesDataPath = path.join(__dirname, '../Data/seriesData.js');

// --- Helper Functions ---

async function getTmdbDetails(id, type) {
    // Append production_companies
    const url = `https://api.themoviedb.org/3/${type}/${id}?api_key=${TMDB_API_KEY}&language=en-US&append_to_response=external_ids,production_companies`; 
    try {
        const res = await axios.get(url);
        return res?.data || null;
    } catch (error) {
        if (error.response && error.response.status === 404) {
             // console.warn(`   ⚠️ TMDb fetch warning: ${type}/${id} not found (404).`); // Less verbose
        } else {
             console.warn(`⚠️ TMDb fetch warning for ${type}/${id}: ${error.message}`);
        }
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
        // console.warn(`⚠️ OMDb fetch warning for ${imdbId}: ${error.message}`);
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
                if (page === 1) { 
                   console.log(`   Found ${totalPages} total pages for this source.`);
                }
            }
        } catch (error) {
            console.warn(`   ⚠️ Error fetching page ${page} from ${url}: ${error.message}`);
        }
        page++;
        // Add delay
        await new Promise(resolve => setTimeout(resolve, 50)); 
    } while (page <= totalPages && page < 50); 
    console.log(`   Finished fetching. Got ${results.length} raw items from this source.`);
    return results;
}

/**
 * Checks if a movie/show is from DC or Warner Bros based on production companies
 */
function isRelevantProduction(details) {
    if (!details?.production_companies?.length) {
        return false; // Strict: require company info
    }
    const allowedCompanyIds = COMPANY_IDS.split('|').map(id => parseInt(id, 10)).filter(id => !isNaN(id));
    
    return details.production_companies.some(company => 
        (company.id && allowedCompanyIds.includes(company.id)) ||
        (company.name && company.name.toLowerCase().includes('dc')) ||
        (company.name && company.name.toLowerCase().includes('warner'))
    );
}

function isAnimation(item) {
    return item.genres && Array.isArray(item.genres) && item.genres.some(genre => genre && genre.id === animationGenreId);
}

function sortByReleaseYear(a, b) {
    const yearA = parseInt(a.releaseYear, 10);
    const yearB = parseInt(b.releaseYear, 10);
    if (isNaN(yearA) && isNaN(yearB)) return 0;
    if (isNaN(yearA)) return 1; 
    if (isNaN(yearB)) return -1; 
    return yearA - yearB;
}

function writeDataFile(filePath, data, dataType) {
    const fileContent = `module.exports = ${JSON.stringify(data, null, 2)};\n`;
    try {
        fs.writeFileSync(filePath, fileContent, 'utf8');
        console.log(`✅ Successfully wrote ${data.length} ${dataType} items to ${path.basename(filePath)}`);
    } catch (error) {
        console.error(`❌ Error writing ${dataType} data to ${path.basename(filePath)}:`, error.message);
    }
}

// --- Main Update Function ---

async function updateAndGenerateData() {
    console.log('🚀 Starting data update and generation process...');

    // 1. Fetch Raw Data using Discover
    console.log('🔄 Fetching initial discovery data from DC/WB...');
    // Use combined COMPANY_IDS for broader discover
    const movieUrl = `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_API_KEY}&language=en-US&with_companies=${COMPANY_IDS}&sort_by=primary_release_date.asc`;
    const tvUrl = `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&language=en-US&with_companies=${COMPANY_IDS}&sort_by=first_air_date.asc`;

    const rawMovies = await fetchAllPages(movieUrl);
    const rawSeries = await fetchAllPages(tvUrl);

    const rawDiscoveries = [
        ...rawMovies.map(i => ({ ...i, fetched_type: 'movie' })), 
        ...rawSeries.map(i => ({ ...i, fetched_type: 'tv' }))
    ];

    // Remove duplicates early
    const uniqueResultsInitial = [];
    const seenIds = new Set();
    for (const item of rawDiscoveries) {
        if (item && item.id && !seenIds.has(item.id)) {
            uniqueResultsInitial.push(item);
            seenIds.add(item.id);
        }
    }
    console.log(`Found ${uniqueResultsInitial.length} unique items from Discover before detailed filtering.`);

    // 2. Fetch Details and Apply Filters
    console.log(`🔄 Fetching details for ${uniqueResultsInitial.length} items and applying filters (Year >= ${MIN_YEAR}, Production Co)...`);
    const detailedData = [];
    let count = 0;
    let skippedByYear = 0;
    let skippedByProdCo = 0;

    for (const release of uniqueResultsInitial) {
        count++;
        process.stdout.write(`   Processing item ${count}/${uniqueResultsInitial.length}...\r`);
        
        const details = await getTmdbDetails(release.id, release.fetched_type);
        if (!details) { continue; }

        // Filter by Year (using detailed info)
        const yearString = (details.release_date || details.first_air_date || '0').split('-')[0];
        const year = parseInt(yearString, 10);
        if (!isNaN(year) && year < MIN_YEAR) {
            skippedByYear++;
            continue;
        }

        // Filter by Production Company
        if (!isRelevantProduction(details)) {
            skippedByProdCo++;
            continue;
        }

        // Passed filters, format and add
        const title = (details.title || details.name || '').trim();
        let displayYear = yearString;
        if (release.fetched_type === 'tv') {
            const firstAir = (details.first_air_date || '').split('-')[0];
            const lastAir = (details.last_air_date || '').split('-')[0];
            if (firstAir && lastAir && firstAir !== lastAir) {
                displayYear = `${firstAir}-${lastAir || 'present'}`;
            } else if (firstAir) {
                displayYear = firstAir;
            }
       }
       if (displayYear === '0' || displayYear === '') displayYear = 'TBD';

        const imdbId = details.external_ids?.imdb_id || `tmdb_${details.id}`; 
        const poster = details.poster_path ? `https://image.tmdb.org/t/p/w500${details.poster_path}` : null;
        const genres = details.genres || []; 

        const omdbDetails = await getOmdbDetails(imdbId);
        const ratings = omdbDetails?.Ratings || [];

        detailedData.push({
            tmdbId: details.id, 
            title,
            type: release.fetched_type === 'tv' ? 'series' : 'movie', // Set type correctly for downstream use
            imdbId,
            id: `dc_${imdbId}`,
            releaseYear: displayYear, 
            poster,
            ratings,
            genres 
        });
    }
    process.stdout.write('\n'); // Clear progress line
    console.log(`✅ Finished processing details. ${detailedData.length} items meet criteria.`);
    console.log(`   Skipped ${skippedByYear} items released before ${MIN_YEAR}.`);
    console.log(`   Skipped ${skippedByProdCo} items for not being relevant DC/WB productions.`);

    // 3. Write All Data (unsorted, but now filtered)
    writeDataFile(outputAllDataPath, detailedData, 'all');

    // 4. Filter, Sort, and Write Release Order Data (Non-Animated)
    console.log('🔄 Processing release order data (excluding animations)...');
    const releaseOrderData = detailedData
        .filter(item => !isAnimation(item)) 
        .sort(sortByReleaseYear);
    writeDataFile(outputReleaseDataPath, releaseOrderData, 'non-animated release order');

    // 5. Filter, Sort, and Write Non-Animated Movies
    console.log('🔄 Processing non-animated movies...');
    const nonAnimatedMovies = detailedData
        .filter(item => item.type === 'movie' && !isAnimation(item))
        .sort(sortByReleaseYear);
    writeDataFile(outputMoviesPath, nonAnimatedMovies, 'non-animated movies');

    // 6. Filter, Sort, and Write Animations 
    console.log('🔄 Processing animations...');
    const animations = detailedData
        .filter(item => isAnimation(item))
        .sort(sortByReleaseYear);
    writeDataFile(outputAnimationsPath, animations, 'animations');

    // 7. Filter, Sort, and Write Series (Non-Animated)
    console.log('🔄 Processing non-animated series data...');
    const seriesOnly = detailedData
        .filter(item => item.type === 'series' && !isAnimation(item))
        .sort(sortByReleaseYear);
    writeDataFile(outputSeriesDataPath, seriesOnly, 'non-animated series');

    console.log('✨ Data update and generation complete!');
}

// --- Run Script ---
updateAndGenerateData().catch(err => {
    console.error('❌ Critical error during script execution:', err);
    process.exit(1);
});
