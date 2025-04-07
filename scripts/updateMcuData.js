const axios = require('axios');
const fs = require('fs');
const path = require('path');

const tmdbKey = process.env.TMDB_API_KEY;
const mcuTitles = [
  "Captain America: The First Avenger", "Captain Marvel", "Iron Man", "The Incredible Hulk",
  "Iron Man 2", "Thor", "The Avengers", "Iron Man 3", "Thor: The Dark World",
  "Captain America: The Winter Soldier", "Guardians of the Galaxy", "Guardians of the Galaxy Vol. 2",
  "Avengers: Age of Ultron", "Ant-Man", "Captain America: Civil War", "Black Widow",
  "Black Panther", "Spider-Man: Homecoming", "Doctor Strange", "Thor: Ragnarok",
  "Avengers: Infinity War", "Ant-Man and the Wasp", "Avengers: Endgame", "Spider-Man: Far From Home",
  "WandaVision", "The Falcon and the Winter Soldier", "Loki", "What If...?",
  "Shang-Chi and the Legend of the Ten Rings", "Eternals", "Hawkeye", "Spider-Man: No Way Home",
  "Moon Knight", "Doctor Strange in the Multiverse of Madness", "Ms. Marvel", "Thor: Love and Thunder",
  "She-Hulk: Attorney at Law", "Werewolf by Night", "Black Panther: Wakanda Forever",
  "The Guardians of the Galaxy Holiday Special", "Ant-Man and the Wasp: Quantumania",
  "Guardians of the Galaxy Vol. 3", "Secret Invasion", "The Marvels", "Echo", "Deadpool & Wolverine",
  "Agatha All Along", "Captain America: Brave New World", "Thunderbolts*", "The Fantastic Four: First Steps",
  "Blade", "Ironheart", "Daredevil: Born Again"
];

async function updateMcuData() {
  const mcuData = [];

  for (const title of mcuTitles) {
    const isSeries = title.includes("Vision") || title.includes("Soldier") || title.includes("Loki") ||
                    title === "What If...?" || title.includes("Hawkeye") || title.includes("Moon Knight") ||
                    title.includes("Ms. Marvel") || title.includes("She-Hulk") || title.includes("Invasion") ||
                    title.includes("Echo") || title.includes("Agatha") || title.includes("Ironheart") ||
                    title.includes("Daredevil");

    const searchUrl = `https://api.themoviedb.org/3/search/${isSeries ? 'tv' : 'movie'}?api_key=${tmdbKey}&query=${encodeURIComponent(title)}`;
    const res = await axios.get(searchUrl).catch(err => {
      console.error(`Error fetching ${title}:`, err.message);
      return { data: { results: [] } };
    });

    const item = res.data.results[0];
    if (item) {
      mcuData.push({
        title,
        type: isSeries ? 'series' : 'movie',
        tmdbId: item.id,
        releaseDate: item.release_date || item.first_air_date || 'TBA'
      });
    }
  }

  mcuData.sort((a, b) => (a.releaseDate === 'TBA' ? 1 : b.releaseDate === 'TBA' ? -1 : a.releaseDate.localeCompare(b.releaseDate)));

  const fileContent = `module.exports = ${JSON.stringify(mcuData, null, 2)};`;
  fs.writeFileSync(path.join(__dirname, '../src/mcuData.js'), fileContent);
  console.log('Updated mcuData.js');
}

updateMcuData().catch(console.error);
