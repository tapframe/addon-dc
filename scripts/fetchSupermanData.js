require('dotenv').config();

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// --- Configuration ---
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const OMDB_API_KEY = process.env.OMDB_API_KEY;
// Expanded list including potential older subsidiaries/related entities
const DC_COMPANY_IDS = '9993|128064|184898|2164|429|1957'; // Added DC Comics (1957)
const WARNER_BROS_COMPANY_IDS = '174|4|8486|82495|132851|5193|80564|9996|6194'; // Added Warner Bros. Pictures (6194)
// Added specific IDs for Superman (1978) producers based on API check
const OTHER_RELEVANT_IDS = '51861|213555'; 
const COMPANY_IDS = `${DC_COMPANY_IDS}|${WARNER_BROS_COMPANY_IDS}|${OTHER_RELEVANT_IDS}`; // Combine DC, Warner Bros, and other relevant IDs
const animationGenreId = 16; // TMDb Genre ID for Animation
const MIN_YEAR = 1960; // Minimum year to include

// Output paths for Superman data
const outputSupermanDataPath = path.join(__dirname, '../Data/everythingsuperman.js');
const outputSupermanAnimationPath = path.join(__dirname, '../Data/everythingsupermananimation.js');

// --- Helper Functions ---
async function getTmdbDetails(id, type) {
    const url = `https://api.themoviedb.org/3/${type}/${id}?api_key=${TMDB_API_KEY}&language=en-US&append_to_response=external_ids,production_companies,credits`; // Add credits
    try {
        const res = await axios.get(url);
        return res?.data || null;
    } catch (error) {
        // Handle 404 specifically
        if (error.response && error.response.status === 404) {
             console.warn(`   ⚠️ TMDb fetch warning: ${type}/${id} not found (404).`);
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
        console.warn(`⚠️ OMDb fetch warning for ${imdbId}: ${error.message}`);
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
            // Add more specific error handling if needed (e.g., rate limiting)
            console.warn(`   ⚠️ Error fetching page ${page} from ${url}: ${error.message}`);
            // Break if too many errors? Or just continue?
            // break; 
        }
        page++;
        // Safety delay to prevent hitting API limits too fast
        await new Promise(resolve => setTimeout(resolve, 50)); // 50ms delay
    } while (page <= totalPages && page < 50); // Keep safety limit
    console.log(`   Finished fetching. Got ${results.length} raw items from this source.`);
    return results;
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
 * Checks if a title or description contains Superman or related keywords
 * @param {string} title - The title to check
 * @param {string} overview - The overview/description to check
 * @returns {boolean} True if the title is Superman-related
 */
function isSupermanRelated(title, overview) {
    if (!title && !overview) return false;
    const lowerTitle = (title || '').toLowerCase();
    const lowerOverview = (overview || '').toLowerCase();
    
    // Check for common Superman-related terms in title or overview
    const keywords = [
        'superman', 'man of steel', 'last son of krypton', 'smallville', 
        'krypton', 'supergirl', 'clark kent', 'kal-el'
    ];
    
    if (keywords.some(k => lowerTitle.includes(k))) {
        // Avoid titles like "Lois & Clark: The New Adventures of Superman" without Clark Kent
        if (lowerTitle.includes('clark kent') && lowerTitle.includes('lois') && !lowerTitle.includes('superman')) {
             return true; // Special case for Lois & Clark
        }
        // General keyword match in title
        if (!lowerTitle.includes('martha') || lowerTitle.includes('superman')) { // Avoid Martha Kent focus if Superman isn't mentioned
             return true;
        }
    }
    
    // Check overview for keywords if title didn't match
    if (keywords.some(k => lowerOverview.includes(k))) {
         return true;
    }

    // Check for Justice League with Superman involvement
    if (lowerTitle.includes('justice league') && (lowerOverview.includes('superman') || lowerOverview.includes('clark kent'))) {
        return true;
    }

    return false;
}

/**
 * Checks if Superman (Clark Kent/Kal-El) is in the main cast.
 * @param {object} details - The detailed item info from TMDb with credits.
 * @returns {boolean} True if Superman is in the main cast.
 */
function isSupermanInCast(details) {
    if (!details?.credits?.cast) return false;
    // Check top ~20 cast members for Superman roles
    return details.credits.cast.slice(0, 20).some(member => 
        member.character && 
        (member.character.toLowerCase().includes('superman') || 
         member.character.toLowerCase().includes('clark kent') ||
         member.character.toLowerCase().includes('kal-el'))
    );
}

/**
 * Checks if a movie/show is from relevant production companies.
 * @param {object} details - The detailed item info from TMDb
 * @returns {boolean} True if it's from a relevant company.
 */
function isRelevantProduction(details) {
    if (!details || !details.production_companies || !Array.isArray(details.production_companies)) {
        // If no company info, we might cautiously include it if relevance is otherwise high?
        // For now, let's be strict: if no company info, assume it's not relevant.
        return false;
    }

    // Split company IDs string into an array of numeric IDs
    const allowedCompanyIds = COMPANY_IDS.split('|').map(id => parseInt(id, 10)).filter(id => !isNaN(id));
    
    // Check if any of the production companies match allowed company IDs or names
    return details.production_companies.some(company => 
        (company.id && allowedCompanyIds.includes(company.id)) ||
        (company.name && company.name.toLowerCase().includes('dc')) ||
        (company.name && company.name.toLowerCase().includes('warner'))
    );
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

function writeDataFile(filePath, data, dataType) {
    const fileContent = `module.exports = ${JSON.stringify(data, null, 2)};\n`;
    try {
        fs.writeFileSync(filePath, fileContent, 'utf8');
        console.log(`✅ Successfully wrote ${data.length} ${dataType} items to ${path.basename(filePath)}`);
    } catch (error) {
        console.error(`❌ Error writing ${dataType} data to ${path.basename(filePath)}:`, error.message);
    }
}

// --- Main Function to Fetch Superman Data ---
async function fetchSupermanData() {
    console.log('🚀 Starting Superman data collection process...');

    // 1. Fetch Raw Data (Keep the same fetching logic as before)
    console.log('🔄 Fetching Superman-related content from DC and Warner Bros...');
    
    // Specific Superman searches
    const supermanMovieUrl = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&language=en-US&query=Superman&include_adult=false`;
    const manOfSteelMovieUrl = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&language=en-US&query=Man%20of%20Steel&include_adult=false`;
    const supermanTvUrl = `https://api.themoviedb.org/3/search/tv?api_key=${TMDB_API_KEY}&language=en-US&query=Superman&include_adult=false`;
    const smallvilleTvUrl = `https://api.themoviedb.org/3/search/tv?api_key=${TMDB_API_KEY}&language=en-US&query=Smallville&include_adult=false`;
    const kryptonTvUrl = `https://api.themoviedb.org/3/search/tv?api_key=${TMDB_API_KEY}&language=en-US&query=Krypton&include_adult=false`;
    const supergirlTvUrl = `https://api.themoviedb.org/3/search/tv?api_key=${TMDB_API_KEY}&language=en-US&query=Supergirl&include_adult=false`;
    const supermanAnimatedUrl = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&language=en-US&query=Superman%20Animated&include_adult=false`;
    const loisAndClarkTvUrl = `https://api.themoviedb.org/3/search/tv?api_key=${TMDB_API_KEY}&language=en-US&query=Lois%20%26%20Clark&include_adult=false`;

    // Justice League searches
    const justiceLeagueMovieUrl = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&language=en-US&query=Justice%20League&include_adult=false`;
    const justiceLeagueTvUrl = `https://api.themoviedb.org/3/search/tv?api_key=${TMDB_API_KEY}&language=en-US&query=Justice%20League&include_adult=false`;

    // Additional company-specific searches (Discover)
    // Use primary_release_date for sorting movies
    const dcMovieUrl = `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_API_KEY}&language=en-US&with_companies=${DC_COMPANY_IDS}&sort_by=primary_release_date.asc`;
    const warnerMovieUrl = `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_API_KEY}&language=en-US&with_companies=${WARNER_BROS_COMPANY_IDS}&sort_by=primary_release_date.asc`;
    const dcTvUrl = `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&language=en-US&with_companies=${DC_COMPANY_IDS}&sort_by=first_air_date.asc`;
    const warnerTvUrl = `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&language=en-US&with_companies=${WARNER_BROS_COMPANY_IDS}&sort_by=first_air_date.asc`;
    const dcAnimationUrl = `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_API_KEY}&language=en-US&with_companies=${DC_COMPANY_IDS}&with_genres=${animationGenreId}&sort_by=primary_release_date.asc`;
    const warnerAnimationUrl = `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_API_KEY}&language=en-US&with_companies=${WARNER_BROS_COMPANY_IDS}&with_genres=${animationGenreId}&sort_by=primary_release_date.asc`;

    // Fetch all data in parallel (same as before)
    const [
        supermanMovies,
        manOfSteelMovies,
        supermanTvShows,
        smallvilleTvShows,
        kryptonTvShows,
        supergirlTvShows,
        supermanAnimatedMovies,
        loisAndClarkTvShows, 
        justiceLeagueMovies, 
        justiceLeagueTvShows,
        dcMovies,
        warnerMovies,
        dcTvShows,
        warnerTvShows,
        dcAnimations,
        warnerAnimations
    ] = await Promise.all([
        fetchAllPages(supermanMovieUrl),
        fetchAllPages(manOfSteelMovieUrl),
        fetchAllPages(supermanTvUrl),
        fetchAllPages(smallvilleTvUrl),
        fetchAllPages(kryptonTvUrl),
        fetchAllPages(supergirlTvUrl),
        fetchAllPages(supermanAnimatedUrl),
        fetchAllPages(loisAndClarkTvUrl),
        fetchAllPages(justiceLeagueMovieUrl),
        fetchAllPages(justiceLeagueTvUrl),
        fetchAllPages(dcMovieUrl),
        fetchAllPages(warnerMovieUrl),
        fetchAllPages(dcTvUrl),
        fetchAllPages(warnerTvUrl),
        fetchAllPages(dcAnimationUrl),
        fetchAllPages(warnerAnimationUrl)
    ]);

    // Combine all search results and mark their source (same as before)
    const allRawResults = [
        ...supermanMovies.map(i => ({ ...i, fetched_type: 'movie', source: 'superman_search' })),
        ...manOfSteelMovies.map(i => ({ ...i, fetched_type: 'movie', source: 'man_of_steel_search' })),
        ...supermanTvShows.map(i => ({ ...i, fetched_type: 'tv', source: 'superman_tv_search' })),
        ...smallvilleTvShows.map(i => ({ ...i, fetched_type: 'tv', source: 'smallville_search' })),
        ...kryptonTvShows.map(i => ({ ...i, fetched_type: 'tv', source: 'krypton_search' })),
        ...supergirlTvShows.map(i => ({ ...i, fetched_type: 'tv', source: 'supergirl_search' })),
        ...loisAndClarkTvShows.map(i => ({ ...i, fetched_type: 'tv', source: 'lois_clark_search' })),
        ...supermanAnimatedMovies.map(i => ({ ...i, fetched_type: 'movie', source: 'superman_animated_search' })),
        ...justiceLeagueMovies.map(i => ({ ...i, fetched_type: 'movie', source: 'justice_league_search' })),
        ...justiceLeagueTvShows.map(i => ({ ...i, fetched_type: 'tv', source: 'justice_league_tv_search' })),
        ...dcMovies.map(i => ({ ...i, fetched_type: 'movie', source: 'dc_discover' })),
        ...warnerMovies.map(i => ({ ...i, fetched_type: 'movie', source: 'warner_discover' })),
        ...dcTvShows.map(i => ({ ...i, fetched_type: 'tv', source: 'dc_tv_discover' })),
        ...warnerTvShows.map(i => ({ ...i, fetched_type: 'tv', source: 'warner_tv_discover' })),
        ...dcAnimations.map(i => ({ ...i, fetched_type: 'movie', source: 'dc_animation_discover' })),
        ...warnerAnimations.map(i => ({ ...i, fetched_type: 'movie', source: 'warner_animation_discover' }))
    ];

    // Remove duplicates based on TMDB ID EARLY (same as before)
    const uniqueResultsInitial = [];
    const seenIds = new Set();
    for (const item of allRawResults) {
        if (item && item.id && !seenIds.has(item.id)) {
            uniqueResultsInitial.push(item);
            seenIds.add(item.id);
        }
    }
    console.log(`Found ${uniqueResultsInitial.length} unique items across all searches before detailed filtering.`);


    // 2. Fetch Details FIRST, then Filter
    console.log(`🔄 Fetching details for ${uniqueResultsInitial.length} items and then applying filters...`);
    const detailedSupermanData = [];
    let count = 0;
    let skippedNonRelevant = 0;
    let skippedByYear = 0;
    
    for (const release of uniqueResultsInitial) {
        count++;
        // Reduce frequency of progress indicator if logging is verbose
        // if (count % 10 === 0) {
            process.stdout.write(`   Processing item ${count}/${uniqueResultsInitial.length}...\r`);
        // }
        
        // Fetch detailed info
        const details = await getTmdbDetails(release.id, release.fetched_type);
        
        if (!details) {
            // console.log(`\n   Skipping item ${release.id} (${release.fetched_type}) due to missing details.`);
            continue; // Skip if no details found
        }
        
        const title = (details.title || details.name || '').trim();
        const itemIdLog = `${title} (ID: ${details.id}, Type: ${release.fetched_type})`;
        console.log(`\nProcessing: ${itemIdLog}`); // Optional: Log start of processing each item

        // ---- Apply Filters AFTER Fetching Details ----
        
        // 1. Filter by Year using DETAILED release date
        const yearString = (details.release_date || details.first_air_date || '0').split('-')[0];
        const year = parseInt(yearString, 10);
         console.log(`  [Filter Check] Year: ${year}`); // Log year being checked
        if (!isNaN(year) && year < MIN_YEAR) {
            // console.log(`  [Filter Skip] Reason: Year (${year} < ${MIN_YEAR})`);
            skippedByYear++;
            continue;
        }

        // 2. Filter by Production Company
        const isProdRelevant = isRelevantProduction(details);
        // console.log(`  [Filter Check] Production Company Relevant: ${isProdRelevant}`); // Log company check result
        if (!isProdRelevant) {
            console.log(`  [Filter Skip] Reason: Production Company`);
            skippedNonRelevant++; // Count skips for company/relevance together
            continue;
        }
        
        // 3. Filter by Relevance (Title/Overview/Cast)
        const overview = details.overview || '';
        let isRelated = isSupermanRelated(title, overview);
        let relevanceSource = 'Title/Overview';
        // If not related by title/overview, check cast for broader search sources
        if (!isRelated && [
                'justice_league_search', 'justice_league_tv_search', 'dc_discover', 
                'warner_discover', 'dc_tv_discover', 'warner_tv_discover',
                'dc_animation_discover', 'warner_animation_discover'
            ].includes(release.source)) {
            isRelated = isSupermanInCast(details);
            if (isRelated) relevanceSource = 'Cast';
        }
        // console.log(`  [Filter Check] Content Relevant: ${isRelated} (Source: ${relevanceSource})`); // Log relevance check result
        if (!isRelated) {
            // console.log(`  [Filter Skip] Reason: Content Relevance`);
            skippedNonRelevant++; // Count skips for company/relevance together
            continue;
        }
        // ---- End Filters ----
        
        // If it passed all filters, format and add it
        // console.log(`  [Filter Pass] Adding item: ${itemIdLog}`); // Log item being added

        // Format release year for display (handle TV ranges)
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
        if (displayYear === '0') displayYear = 'TBD';

        const imdbId = details.external_ids?.imdb_id || `tmdb_${release.id}`; 
        const poster = details.poster_path ? `https://image.tmdb.org/t/p/w500${details.poster_path}` : null;
        const genres = details.genres || []; 

        // Fetch additional info from OMDb
        const omdbDetails = await getOmdbDetails(imdbId);
        const ratings = omdbDetails?.Ratings || [];

        detailedSupermanData.push({
            tmdbId: release.id,
            title,
            type: release.fetched_type === 'tv' ? 'tv' : 'movie',
            imdbId,
            id: `dc_${imdbId}`,
            releaseYear: displayYear, 
            poster,
            ratings,
            genres
        });
    }
    
    process.stdout.write('\n'); // Clear the progress line
    console.log(`✅ Finished processing details. ${detailedSupermanData.length} Superman items meet criteria.`);
    console.log(`   Skipped ${skippedByYear} items released before ${MIN_YEAR}.`);
    console.log(`   Skipped ${skippedNonRelevant} items for not being relevant DC/WB productions.`);

    // 3. Separate Superman animations from other Superman content (same as before)
    const supermanAnimations = detailedSupermanData.filter(item => isAnimation(item));
    const supermanNonAnimations = detailedSupermanData.filter(item => !isAnimation(item)); // Includes movies AND series

    // 4. Sort and Write Superman Data (same as before)
    const sortedSupermanAnimations = supermanAnimations.sort(sortByReleaseYear);
    const sortedSupermanNonAnimations = supermanNonAnimations.sort(sortByReleaseYear);

    writeDataFile(outputSupermanAnimationPath, sortedSupermanAnimations, 'Superman animation');
    writeDataFile(outputSupermanDataPath, sortedSupermanNonAnimations, 'Superman non-animation (movies & series)');

    console.log('✨ Superman data collection complete!');
    console.log(`📊 Stats: ${supermanAnimations.length} animations and ${supermanNonAnimations.length} non-animations (movies/series).`);
}

// --- Run Script ---
fetchSupermanData().catch(err => {
    console.error('❌ Critical error during script execution:', err);
    process.exit(1);
}); 