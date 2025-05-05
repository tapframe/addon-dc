const fs = require('fs');
const path = require('path');

// --- Configuration ---
const moviesDataPath = path.join(__dirname, '../Data/moviesData.js');
const seriesDataPath = path.join(__dirname, '../Data/seriesData.js');
const outputReleaseDataPath = path.join(__dirname, '../Data/releaseData.js');

// --- Helper Functions ---

/**
 * Reads data from a JS module file.
 * @param {string} filePath - Path to the input file.
 * @param {string} dataType - Name of the data type for logging.
 * @returns {Array} The data array or an empty array if error.
 */
function readDataFile(filePath, dataType) {
    try {
        if (fs.existsSync(filePath)) {
            // Clear require cache to ensure fresh read
            delete require.cache[require.resolve(filePath)];
            const data = require(filePath);
            console.log(`✅ Successfully read ${data.length} ${dataType} items from ${path.basename(filePath)}`);
            return Array.isArray(data) ? data : [];
        } else {
            console.warn(`⚠️ Input file not found: ${path.basename(filePath)}. Skipping.`);
            return [];
        }
    } catch (error) {
        console.error(`❌ Error reading ${dataType} data from ${path.basename(filePath)}:`, error.message);
        return [];
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

/**
 * Writes data to a file, handling errors.
 * @param {string} filePath - Path to the output file.
 * @param {Array} data - The data array to write.
 * @param {string} dataType - Name of the data type for logging.
 */
function writeDataFile(filePath, data, dataType) {
    const fileContent = `module.exports = ${JSON.stringify(data, null, 2)};\n`;
    try {
        fs.writeFileSync(filePath, fileContent, 'utf8');
        console.log(`✅ Successfully wrote ${data.length} ${dataType} items to ${path.basename(filePath)}`);
    } catch (error) {
        console.error(`❌ Error writing ${dataType} data to ${path.basename(filePath)}:`, error.message);
    }
}

// --- Main Combine Function ---

function combineAndWriteReleaseData() {
    console.log('🚀 Starting combined release data generation...');

    // 1. Read Input Data
    const moviesData = readDataFile(moviesDataPath, 'movie');
    const seriesData = readDataFile(seriesDataPath, 'non-animated series');

    // 2. Combine Data
    // Filter out any potential null/undefined entries just in case
    const combinedData = [
        ...moviesData.filter(item => item),
        ...seriesData.filter(item => item)
    ];
    console.log(`Combined ${combinedData.length} total items.`);

    // 3. Sort Combined Data
    combinedData.sort(sortByReleaseYear);
    console.log('Sorted combined data by release year.');

    // 4. Write Output Data
    writeDataFile(outputReleaseDataPath, combinedData, 'combined release order');

    console.log('\n✨ Combined release data generation complete!');
}

// --- Run Script ---

combineAndWriteReleaseData(); 