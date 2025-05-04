const fs = require('fs');
const path = require('path');

// --- Configuration ---
const inputDataPath = path.join(__dirname, '../Data/Data.js');
const outputChronologicalPath = path.join(__dirname, '../Data/chronologicalData.js');

// Define the specific DCEU chronological order based on user list
// NOTE: Using the first listed year/title for entries like Justice League
const dceuOrder = [
    { title: 'Wonder Woman', year: '2017', type: 'movie' },
    { title: 'Wonder Woman 1984', year: '2020', type: 'movie' },
    { title: 'Man of Steel', year: '2013', type: 'movie' },
    { title: 'Batman v Superman: Dawn of Justice', year: '2016', type: 'movie' },
    { title: 'Suicide Squad', year: '2016', type: 'movie' },
    { title: 'Justice League', year: '2017', type: 'movie' }, // Using 2017 version
    { title: "Zack Snyder's Justice League", year: '2021', type: 'movie' }, // Added Snyder Cut
    { title: 'Aquaman', year: '2018', type: 'movie' },
    { title: 'Shazam!', year: '2019', type: 'movie' },
    { title: 'Birds of Prey (and the Fantabulous Emancipation of One Harley Quinn)', year: '2020', type: 'movie' },
    { title: 'The Suicide Squad', year: '2021', type: 'movie' },
    { title: 'Peacemaker', year: '2022', type: 'series' },
    { title: 'Black Adam', year: '2022', type: 'movie' },
    { title: 'Shazam! Fury of the Gods', year: '2023', type: 'movie' },
    { title: 'The Flash', year: '2023', type: 'movie' },
    { title: 'Aquaman and the Lost Kingdom', year: '2023', type: 'movie' },
];

// --- Main Logic ---

console.log('🔄 Generating DCEU chronological data file (chronologicalData.js)...');

// 1. Read the main data file
let allData = [];
try {
    if (fs.existsSync(inputDataPath)) {
        allData = require(inputDataPath);
        if (!Array.isArray(allData)) {
            throw new Error('Data.js does not contain a valid array.');
        }
        console.log(`✅ Loaded ${allData.length} items from ${inputDataPath}`);
    } else {
        console.error(`❌ Error: Input file not found at ${inputDataPath}`);
        console.log('Ensure Data.js exists. Run updateData.js if needed.');
        process.exit(1);
    }
} catch (error) {
    console.error(`❌ Error loading data from ${inputDataPath}:`, error.message);
    process.exit(1);
}

// 2. Create a lookup map from the main data for faster access
// Key: lowercase title | type | year -> Value: full data object
const dataMap = allData.reduce((map, item) => {
    const key = `${(item.title || '').toLowerCase()}|${item.type}|${item.releaseYear}`;
    map.set(key, item);
    // Add fallback key without year for potential mismatches
    const keyWithoutYear = `${(item.title || '').toLowerCase()}|${item.type}`;
     if (!map.has(keyWithoutYear)) { // Only add if primary key wasn't enough
       map.set(keyWithoutYear, item);
     }
    return map;
}, new Map());
console.log('🗺️ Created lookup map from Data.js');


// 3. Build the chronological list by looking up items
const chronologicalOutputData = [];
console.log('🔍 Matching chronological order against loaded data...');
for (const orderedItem of dceuOrder) {
    const key = `${orderedItem.title.toLowerCase()}|${orderedItem.type}|${orderedItem.year}`;
     const keyWithoutYear = `${orderedItem.title.toLowerCase()}|${orderedItem.type}`;
    let foundItem = dataMap.get(key) || dataMap.get(keyWithoutYear); // Try with and without year

    if (foundItem) {
        // Ensure all necessary fields are present (copying the whole object is safest)
         chronologicalOutputData.push(foundItem);
        console.log(`   ✔️ Found: ${orderedItem.title} (${orderedItem.year})`);
    } else {
        console.warn(`   ⚠️ Could not find entry for: ${orderedItem.title} (${orderedItem.year}) in Data.js. Skipping.`);
    }
}
console.log(`📊 Built chronological list with ${chronologicalOutputData.length} entries.`);


// 4. Prepare content for the output file
const fileContent = `module.exports = ${JSON.stringify(chronologicalOutputData, null, 2)};\n`;

// 5. Write to chronologicalData.js
try {
    fs.writeFileSync(outputChronologicalPath, fileContent, 'utf8');
    console.log(`✅ Successfully wrote ${chronologicalOutputData.length} items to ${outputChronologicalPath}`);
} catch (error) {
    console.error(`❌ Error writing data to ${outputChronologicalPath}:`, error.message);
    process.exit(1);
}

console.log('✨ DCEU Chronological data generation complete.'); 