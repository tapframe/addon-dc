require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// --- Configuration ---
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const OMDB_API_KEY = process.env.OMDB_API_KEY; // Optional, will fetch ratings if key is valid
const animationGenreId = 16; // TMDb Genre ID for Animation

const outputSeriesPath = path.join(__dirname, '../Data/seriesData.js');

// --- List of Specific Series to Fetch ---
// Format: { title: "Series Title", year: StartYYYY, animated: boolean (optional) }
const seriesToFetch = [
    // Classic Live-Action DC Series (1950s–1990s)
    { title: "Adventures of Superman", year: 1952 },
    { title: "Batman", year: 1966 },
    { title: "Shazam!", year: 1974 },
    { title: "The Secrets of Isis", year: 1975 },
    { title: "Wonder Woman", year: 1975 }, // Or "The New Adventures of Wonder Woman"
    { title: "Superboy", year: 1988 },
    { title: "Swamp Thing", year: 1990 },
    { title: "The Flash", year: 1990 },
    { title: "Human Target", year: 1992 },
    { title: "Lois & Clark: The New Adventures of Superman", year: 1993 },
    // Modern Era & Arrowverse (2000s–2020s)
    { title: "Smallville", year: 2001 },
    { title: "Birds of Prey", year: 2002 },
    { title: "Human Target", year: 2010 },
    { title: "Arrow", year: 2012 },
    { title: "Gotham", year: 2014 },
    { title: "The Flash", year: 2014 },
    { title: "Constantine", year: 2014 },
    { title: "Supergirl", year: 2015 },
    { title: "DC's Legends of Tomorrow", year: 2016 },
    { title: "Lucifer", year: 2016 },
    { title: "Powerless", year: 2017 },
    { title: "Black Lightning", year: 2018 },
    { title: "Krypton", year: 2018 },
    { title: "Titans", year: 2018 },
    { title: "Doom Patrol", year: 2019 },
    { title: "Swamp Thing", year: 2019 },
    { title: "Stargirl", year: 2020 }, // Or "DC's Stargirl"
    { title: "Superman & Lois", year: 2021 },
    { title: "Naomi", year: 2022 },
    { title: "Peacemaker", year: 2022 },
    { title: "The Sandman", year: 2022 },
    { title: "Gotham Knights", year: 2023 },
    // Upcoming and Recent DC Series (2024–2025)
    { title: "Creature Commandos", year: 2024, animated: true },
    { title: "Dead Boy Detectives", year: 2024 },
    { title: "The Penguin", year: 2024 },
    { title: "Batman: Caped Crusader", year: 2024, animated: true },
    { title: "Kite Man: Hell Yeah!", year: 2024, animated: true }, // May need title variation? Harley Quinn spinoff.
    { title: "Suicide Squad ISEKAI", year: 2024, animated: true },
    // { title: "Peacemaker", year: 2025 }, // Season 2 - fetch main show details?
    { title: "Lanterns", year: 2025 }, // Placeholder, may not exist yet
    { title: "Waller", year: 2025 }, // Placeholder, may not exist yet
    { title: "Paradise Lost", year: 2025 }, // Placeholder, Wonder Woman prequel?
    { title: "Booster Gold", year: 2025 }, // Placeholder, may not exist yet
];


// --- Helper Functions ---

async function searchTmdbSeries(title, year) {
    const url = `https://api.themoviedb.org/3/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}&first_air_date_year=${year}&language=en-US`;
    try {
        console.log(`   Searching TMDb for TV: "${title}" (First air year: ${year})`);
        const res = await axios.get(url);
        if (res.data && res.data.results && res.data.results.length > 0) {
            // Basic heuristic: Assume the first result is the most likely match
            console.log(`   Found TMDb ID: ${res.data.results[0].id} for "${res.data.results[0].name}"`);
            return res.data.results[0].id;
        } else {
            // Try searching without year if initial search fails
            const urlNoYear = `https://api.themoviedb.org/3/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}&language=en-US`;
            console.log(`   Retrying search without year for TV: "${title}"`);
            const resNoYear = await axios.get(urlNoYear);
            if (resNoYear.data && resNoYear.data.results && resNoYear.data.results.length > 0) {
                 // Try to find one with a matching year if possible
                 const matchingYearResult = resNoYear.data.results.find(r => r.first_air_date && r.first_air_date.startsWith(year.toString()));
                 if (matchingYearResult) {
                      console.log(`   Found TMDb ID (no year search): ${matchingYearResult.id} for "${matchingYearResult.name}"`);
                      return matchingYearResult.id;
                 } else {
                     // Fallback to first result of no-year search
                     console.log(`   Found TMDb ID (no year search, fallback): ${resNoYear.data.results[0].id} for "${resNoYear.data.results[0].name}"`);
                     return resNoYear.data.results[0].id;
                 }
            } else {
                 console.warn(`   ⚠️ TMDb search warning: No results found for TV "${title}" (with or without year)`);
                 return null;
            }
        }
    } catch (error) {
        console.error(`   ❌ TMDb search error for TV "${title}" (${year}): ${error.message}`);
        return null;
    }
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
        console.log(`\n✅ Successfully wrote ${data.length} non-animated series items with required metadata to ${path.basename(filePath)}`);
    } catch (error) {
        console.error(`\n❌ Error writing non-animated series data to ${path.basename(filePath)}: ${error.message}`);
    }
}

/**
 * Sorts items by first air year (ascending). Handles 'TBD' or invalid years.
 * @param {object} a - First item for comparison.
 * @param {object} b - Second item for comparison.
 * @returns {number} Sorting order.
 */
function sortByFirstAirYear(a, b) {
    const yearA = parseInt(a.releaseYear, 10); // Using releaseYear field for consistency
    const yearB = parseInt(b.releaseYear, 10);

    if (isNaN(yearA) && isNaN(yearB)) return 0;
    if (isNaN(yearA)) return 1;
    if (isNaN(yearB)) return -1;

    return yearA - yearB;
}

// --- Main Fetch Function ---

async function fetchSpecificSeries() {
    console.log('🚀 Starting specific series data fetching process...');
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

        // --- Filter: Check for essential metadata --- 
        if (!details.poster_path) {
            console.warn(`   Skipping "${series.title}" (${series.year}) - Missing poster image.`);
            continue;
        }
        if (!details.overview || details.overview.trim() === '') {
             console.warn(`   Skipping "${series.title}" (${series.year}) - Missing description/overview.`);
             continue;
        }
        // --- End Filter ---

        const title = (details.name || series.title).trim(); // Use 'name' for TV shows
        const releaseYear = (details.first_air_date || series.year.toString() || 'TBD').split('-')[0];
        const imdbId = details.external_ids?.imdb_id || null;
        const poster = details.poster_path ? `https://image.tmdb.org/t/p/w500${details.poster_path}` : null;
        const genres = details.genres || [];
        // Check if explicitly marked as animated or if Animation genre ID is present
        const isAnimated = series.animated || (genres && genres.some(g => g && g.id === animationGenreId));

        const omdbDetails = await getOmdbDetails(imdbId);
        const ratings = omdbDetails?.Ratings || [];

        // Only add non-animated series to the final list
        if (!isAnimated) {
            finalSeriesData.push({
                tmdbId: tmdbId,
                title,
                type: 'series',
                imdbId: imdbId || `tmdb_${tmdbId}`,
                id: `dc_${imdbId || 'tmdb_' + tmdbId}`,
                releaseYear, // Storing first air year here
                poster,
                ratings,
                genres,
                // isAnimated: isAnimated // We know it's false if we're here, could omit
            });
            console.log(`   Successfully processed "${title}" (Live-Action with required metadata)`);
        } else {
             console.log(`   Skipping "${title}" because it is animated.`);
        }
    }

    // Sort the final list by first air year
    finalSeriesData.sort(sortByFirstAirYear);

    // Write the collected data to the output file
    writeDataFile(outputSeriesPath, finalSeriesData);

    console.log('\n✨ Specific series data fetching complete!');
}

// --- Run Script ---

fetchSpecificSeries().catch(err => {
    console.error('❌ Critical error during script execution:', err);
    process.exit(1);
}); 