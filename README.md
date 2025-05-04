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

## 📦 Installation

**Option 1: Find in Stremio (If Published)**

1.  Go to *Addons* → *Community Addons*.
2.  Search for "DC Universe Addon".
3.  Click "Install".

**Option 2: Self-Hosting**

1.  Deploy the addon.
2.  In Stremio, go to *Addons* → *+ add Addon*.
3.  Paste your manifest URL (e.g., `https://your-url.com/manifest.json`) and click "Install".

---

## 📊 Updating Data

This addon relies on generated data files. To update:

1.  Set up API keys in a `.env` file (`TMDB_API_KEY`, `OMDB_API_KEY`).
2.  Install dependencies: `npm install`
3.  Run the update script: `node scripts/updateData.js`
4.  Run the chronological script: `node scripts/generateChronologicalData.js`
5.  Restart/redeploy the addon.

---

## 🙏 Acknowledgements

This addon is a modified fork of the original Marvel addon created by **joaogonp**. Many thanks for the initial work!

---





---

## 📬 Feedback

Issues, suggestions, or questions? Open an issue.

---

## 📜 License

This project is under the MIT License.
