require('dotenv').config();

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// --- Configuration ---
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const OMDB_API_KEY = process.env.OMDB_API_KEY;
const DC_COMPANY_IDS = '9993|128064|184898|2164|429|1957'; 
const WARNER_BROS_COMPANY_IDS = '174|4|8486|82495|132851|5193|80564|9996|6194'; 
const OTHER_RELEVANT_IDS = '306'; // Keep 20th Century Fox (306) for Batman 1966
const COMPANY_IDS = `${DC_COMPANY_IDS}|${WARNER_BROS_COMPANY_IDS}|${OTHER_RELEVANT_IDS}`;
const animationGenreId = 16; 
const MIN_YEAR = 1960; 

// Output paths for Batman data
const outputBatmanDataPath = path.join(__dirname, '../Data/everythingbatman.js');
const outputBatmanAnimationPath = path.join(__dirname, '../Data/everythingbatmananimation.js');

// --- Helper Functions ---
async function getTmdbDetails(id, type) {
    const url = `https://api.themoviedb.org/3/${type}/${id}?api_key=${TMDB_API_KEY}&language=en-US&append_to_response=external_ids,production_companies,credits`;
    try {
        const res = await axios.get(url);
        return res?.data || null;
    } catch (error) {
        if (error.response && error.response.status === 404) {
             // console.warn(`   ⚠️ TMDb fetch warning: ${type}/${id} not found (404).`); // Less verbose 404
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
        await new Promise(resolve => setTimeout(resolve, 50)); 
    } while (page <= totalPages && page < 50); 
    console.log(`   Finished fetching. Got ${results.length} raw items from this source.`);
    return results;
}

function sortByReleaseYear(a, b) {
    const yearA = parseInt(a.releaseYear, 10);
    const yearB = parseInt(b.releaseYear, 10);
    if (isNaN(yearA) && isNaN(yearB)) return 0;
    if (isNaN(yearA)) return 1; 
    if (isNaN(yearB)) return -1; 
    return yearA - yearB;
}

/**
 * Stricter check for Batman presence keywords.
 */
function isStrictlyBatmanRelated(title, overview) {
    if (!title && !overview) return false;
    const lowerTitle = (title || '').toLowerCase();
    const lowerOverview = (overview || '').toLowerCase();
    
    // Core Batman keywords
    const keywords = ['batman', 'dark knight', 'bruce wayne'];

    if (keywords.some(k => lowerTitle.includes(k))) {
        return true;
    }
    
    // Check overview only if title didn't match
    if (keywords.some(k => lowerOverview.includes(k))) {
         return true;
    }
    
    // Allow 'Gotham' only if Batman/Wayne is also mentioned
    if (lowerTitle.includes('gotham') && keywords.some(k => lowerTitle.includes(k) || lowerOverview.includes(k))) {
         return true;
    }
    
    // Allow 'Justice League' only if Batman/Wayne is also mentioned
    if (lowerTitle.includes('justice league') && keywords.some(k => lowerTitle.includes(k) || lowerOverview.includes(k))) {
        return true;
    }

    return false;
}

/**
 * Checks if Batman (Bruce Wayne) is in the main cast.
 */
function isBatmanInCast(details) {
    if (!details?.credits?.cast) return false;
    return details.credits.cast.slice(0, 25).some(member => // Check slightly more cast members
        member.character && 
        (member.character.toLowerCase().includes('batman') || 
         member.character.toLowerCase().includes('bruce wayne'))
    );
}

/**
 * Checks if a movie/show is from relevant production companies.
 */
function isRelevantProduction(details) {
    if (!details?.production_companies?.length) {
        return false;
    }
    const allowedCompanyIds = COMPANY_IDS.split('|').map(id => parseInt(id, 10)).filter(id => !isNaN(id));
    const allowedCompanyNames = OTHER_RELEVANT_IDS.split('|').filter(name => isNaN(parseInt(name, 10)));
    
    return details.production_companies.some(company => 
        (company.id && allowedCompanyIds.includes(company.id)) ||
        (company.name && company.name.toLowerCase().includes('dc')) ||
        (company.name && company.name.toLowerCase().includes('warner')) ||
        (company.name && allowedCompanyNames.some(name => company.name.toLowerCase().includes(name.toLowerCase())))
    );
}

function isAnimation(item) {
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

// --- Main Function to Fetch Batman Data ---
async function fetchBatmanData() {
    console.log('🚀 Starting STRICT Batman data collection process...');

    // 1. Fetch Raw Data
    console.log('🔄 Fetching Batman-related content (stricter sources)...');
    
    // Core Batman searches
    const batmanMovieUrl = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&language=en-US&query=Batman&include_adult=false`;
    const darkKnightMovieUrl = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&language=en-US&query=Dark%20Knight&include_adult=false`;
    const batmanTvUrl = `https://api.themoviedb.org/3/search/tv?api_key=${TMDB_API_KEY}&language=en-US&query=Batman&include_adult=false`;
    const gothamTvUrl = `https://api.themoviedb.org/3/search/tv?api_key=${TMDB_API_KEY}&language=en-US&query=Gotham&include_adult=false`; // Keep Gotham search, filter later
    const batmanAnimatedUrl = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&language=en-US&query=Batman%20Animated&include_adult=false`;
    // REMOVED Batgirl/Batwoman searches

    // Justice League searches (will rely on cast check)
    const justiceLeagueMovieUrl = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&language=en-US&query=Justice%20League&include_adult=false`;
    const justiceLeagueTvUrl = `https://api.themoviedb.org/3/search/tv?api_key=${TMDB_API_KEY}&language=en-US&query=Justice%20League&include_adult=false`;

    // Discover searches (will rely on cast check + keywords)
    const dcMovieUrl = `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_API_KEY}&language=en-US&with_companies=${COMPANY_IDS}&sort_by=primary_release_date.asc`; // Combine company discover
    const dcTvUrl = `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&language=en-US&with_companies=${COMPANY_IDS}&sort_by=first_air_date.asc`;
    const dcAnimationUrl = `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_API_KEY}&language=en-US&with_companies=${COMPANY_IDS}&with_genres=${animationGenreId}&sort_by=primary_release_date.asc`;
    // REMOVED separate Warner searches, combined into COMPANY_IDS discover

    // Fetch all data
    const [
        batmanMovies, darkKnightMovies, batmanTvShows, gothamTvShows, 
        batmanAnimatedMovies, 
        justiceLeagueMovies, justiceLeagueTvShows,
        dcMovies, dcTvShows, dcAnimations
    ] = await Promise.all([
        fetchAllPages(batmanMovieUrl), fetchAllPages(darkKnightMovieUrl), fetchAllPages(batmanTvUrl), fetchAllPages(gothamTvUrl),
        fetchAllPages(batmanAnimatedUrl), 
        fetchAllPages(justiceLeagueMovieUrl), fetchAllPages(justiceLeagueTvUrl),
        fetchAllPages(dcMovieUrl), fetchAllPages(dcTvUrl), fetchAllPages(dcAnimationUrl)
    ]);

    // Combine results
    const allRawResults = [
        ...batmanMovies.map(i => ({ ...i, fetched_type: 'movie', source: 'batman_search' })),
        ...darkKnightMovies.map(i => ({ ...i, fetched_type: 'movie', source: 'dark_knight_search' })),
        ...batmanTvShows.map(i => ({ ...i, fetched_type: 'tv', source: 'batman_tv_search' })),
        ...gothamTvShows.map(i => ({ ...i, fetched_type: 'tv', source: 'gotham_search' })),
        ...batmanAnimatedMovies.map(i => ({ ...i, fetched_type: 'movie', source: 'batman_animated_search' })),
        // REMOVED Batgirl/Batwoman results
        ...justiceLeagueMovies.map(i => ({ ...i, fetched_type: 'movie', source: 'justice_league_search' })),
        ...justiceLeagueTvShows.map(i => ({ ...i, fetched_type: 'tv', source: 'justice_league_tv_search' })),
        ...dcMovies.map(i => ({ ...i, fetched_type: 'movie', source: 'dc_discover' })),
        // REMOVED Warner discover (covered by combined company discover)
        ...dcTvShows.map(i => ({ ...i, fetched_type: 'tv', source: 'dc_tv_discover' })),
        // REMOVED Warner discover
        ...dcAnimations.map(i => ({ ...i, fetched_type: 'movie', source: 'dc_animation_discover' }))
        // REMOVED Warner discover
    ].filter(item => item.fetched_type === 'movie' || item.fetched_type === 'tv'); 

    // Remove duplicates early
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
    console.log(`🔄 Fetching details for ${uniqueResultsInitial.length} items and applying STRICT filters...`);
    const detailedBatmanData = [];
    let count = 0;
    let skippedNonRelevant = 0;
    let skippedByYear = 0;
    
    for (const release of uniqueResultsInitial) {
        count++;
        process.stdout.write(`   Processing item ${count}/${uniqueResultsInitial.length}...\r`);
        
        const details = await getTmdbDetails(release.id, release.fetched_type);
        if (!details) { continue; }

        const title = (details.title || details.name || '').trim();
        const itemIdLog = `${title} (ID: ${details.id}, Type: ${release.fetched_type})`;
        console.log(`\nProcessing: ${itemIdLog}`); 

        // ---- Apply Filters ----
        // 1. Filter by Year
        const yearString = (details.release_date || details.first_air_date || '0').split('-')[0];
        const year = parseInt(yearString, 10);
        console.log(`  [Filter Check] Year: ${year}`);
        if (!isNaN(year) && year < MIN_YEAR) {
            console.log(`  [Filter Skip] Reason: Year (${year} < ${MIN_YEAR})`);
            skippedByYear++;
            continue;
        }

        // 2. Filter by Production Company
        const isProdRelevant = isRelevantProduction(details);
        console.log(`  [Filter Check] Production Company Relevant: ${isProdRelevant}`);
        if (!isProdRelevant) {
            console.log(`  [Filter Skip] Reason: Production Company`);
            skippedNonRelevant++; 
            continue;
        }
        
        // 3. Filter by STICT Relevance (Batman must be present)
        const overview = details.overview || '';
        let isRelated = false;
        let relevanceReason = 'None';

        // Check 1: Direct keywords in title/overview?
        if (isStrictlyBatmanRelated(title, overview)) {
            isRelated = true;
            relevanceReason = 'Title/Overview Keyword';
        }

        // Check 2: Is Batman in the cast? (Especially important for broader searches)
        if (!isRelated || [
             'justice_league_search', 'justice_league_tv_search', 
             'dc_discover', 'dc_tv_discover', 'dc_animation_discover', 
             'gotham_search' // Treat Gotham search similar to discover
            ].includes(release.source)) {
            const castCheck = isBatmanInCast(details);
            if (castCheck) {
                 isRelated = true; // Override if cast check passes
                 relevanceReason = 'Cast Check';
            }
        }
       
        console.log(`  [Filter Check] Content Relevant (Batman Present): ${isRelated} (Reason: ${relevanceReason})`);
        if (!isRelated) {
            console.log(`  [Filter Skip] Reason: Batman Not Present (Keywords/Cast)`);
            skippedNonRelevant++; 
            continue;
        }
        // ---- End Filters ----
        
        console.log(`  [Filter Pass] Adding item: ${itemIdLog}`);

        // Format release year 
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

        const imdbId = details.external_ids?.imdb_id || `tmdb_${details.id}`; // Use details.id as fallback
        const poster = details.poster_path ? `https://image.tmdb.org/t/p/w500${details.poster_path}` : null;
        const genres = details.genres || []; 

        const omdbDetails = await getOmdbDetails(imdbId);
        const ratings = omdbDetails?.Ratings || [];

        detailedBatmanData.push({
            tmdbId: details.id, // Use ID from details
            title,
            type: release.fetched_type, 
            imdbId,
            id: `dc_${imdbId}`,
            releaseYear: displayYear, 
            poster,
            ratings,
            genres
        });
    }
    
    process.stdout.write('\n'); 
    console.log(`✅ Finished processing details. ${detailedBatmanData.length} STRICT Batman items meet criteria.`);
    console.log(`   Skipped ${skippedByYear} items released before ${MIN_YEAR}.`);
    console.log(`   Skipped ${skippedNonRelevant} items for not being relevant DC/WB/Fox productions or Batman not present.`);

    // 3. Separate animations
    const batmanAnimations = detailedBatmanData.filter(item => isAnimation(item));
    const batmanNonAnimations = detailedBatmanData.filter(item => !isAnimation(item)); 

    // 4. Sort and Write Data
    const sortedBatmanAnimations = batmanAnimations.sort(sortByReleaseYear);
    const sortedBatmanNonAnimations = batmanNonAnimations.sort(sortByReleaseYear);

    writeDataFile(outputBatmanAnimationPath, sortedBatmanAnimations, 'Batman animation (Strict)');
    writeDataFile(outputBatmanDataPath, sortedBatmanNonAnimations, 'Batman non-animation (Strict - movies & series)');

    console.log('✨ STRICT Batman data collection complete!');
    console.log(`📊 Stats: ${batmanAnimations.length} animations and ${batmanNonAnimations.length} non-animations (movies/series).`);
}

// --- Run Script ---
fetchBatmanData().catch(err => {
    console.error('❌ Critical error during script execution:', err);
    process.exit(1);
}); 