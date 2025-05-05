# 🦇 DC Universe Add-on for Stremio

Explore the DC Universe within Stremio! Browse movies and series by **chronological order**, **release date**, or content type (**movies**, **series**, **animations**).

---

## ✨ Features

*   🕰️ **Chronological Order**: Based on a curated DCEU timeline.
*   📅 **Release Date**: Browse non-animated titles by original release order.
*   🎬 **Movies, Series & Animations**: Filter by content type.
*   ⚡ **Data Updates**: Easily refresh content using the included scripts.
*   🚀 **Fast & Lightweight**: Optimized for performance.

---

## 🎉 What's New (May 2024)

*   **Curated Catalogs**: Added specific, curated catalogs for:
    *   DCEU Movies
    *   Modern DC Series (Live-Action, 2010s-Present)
    *   All Batman Movies (Live-Action & Serials)
    *   All Superman Movies (Live-Action & Serials)
*   **Improved Data Quality**: Items without essential metadata (poster image, overview) are now filtered out during data generation.
*   **Catalog Reordering**: Catalogs are now ordered more logically in the Stremio interface.
*   **Manifest Update**: Catalogs now use the `DC` type for better grouping in Stremio.

---

## 📝 Current Coverage

Currently, the addon primarily supports DC content from 2010 onwards with a limited catalog. Additional categories covering the entire DC universe will be added based on user needs and requests.

---

## 📦 Installation

Direct Installation Link**

1.  Click this link to install directly in Stremio:
    [`https://addon-dc.onrender.com`](https://addon-dc.onrender.com)


---

## 📊 Updating Data

This section is for those who self-host the addon. To update the data files:

1.  Set up API keys in a `.env` file (`TMDB_API_KEY`, `OMDB_API_KEY` - OMDb is optional but recommended for ratings).
2.  Install dependencies: `npm install`
3.  Run the specific fetch scripts you need (e.g., `node scripts/fetchMoviesList.js`, `node scripts/fetchSeriesList.js`, etc.).
4.  Run the combine script if you updated movies or series: `node scripts/combineReleaseData.js`
5.  Run the chronological script (if it relies on updated base data): `node scripts/generateChronologicalData.js`
6.  Restart/redeploy the addon.

---

## 🔄 Automatic Updates

This addon's content is automatically updated on the 1st day of every month using GitHub Actions. The workflow:

1. Fetches the latest DC Universe data from external APIs
2. Updates the data files
3. Commits and pushes changes to the repository

---

## 🙏 Acknowledgements

This addon is a modified fork of the original Marvel addon created by **joaogonp**. Many thanks for the initial work!

---

## 📜 License

This project is under the MIT License.

---

## ☕ Support

If you find this addon useful, you can support its development:

[Buy Me a Coffee🍺](https://buymeacoffee.com/tapframe)

---

## 📬 Feedback

Issues, suggestions, or questions? Open an issue.
