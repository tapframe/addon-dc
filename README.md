# 🦇 DC Universe Add-on for Stremio

Explore the DC Universe within Stremio! Browse movies and series by **chronological order**, **release date**, or content type (**movies**, **series**, **animations**).

---

## ✨ Features

*   🕰️ **Chronological Order**: Based on a curated DCEU timeline.
*   📅 **Release Date**: Browse non-animated titles by original release order.
*   🎬 **Movies, Series & Animations**: Filter by content type.
*   ⚡ **Data Updates**: Easily refresh content using the included scripts.
*   🚀 **Fast & Lightweight**: Optimized for performance.
*   🔍 **Custom Catalogs**: Create your personal catalog selection based on your preferences.

---

## 🎉 What's New (June 2024)

*   **Simplified Custom Catalogs**: Now you can select which DC catalogs to include without needing a unique identifier.
*   **Improved User Experience**: The configuration page has been redesigned for ease of use.
*   **Streamlined URL Structure**: Cleaner, simpler URLs for custom catalog configurations.

### Previous Updates (May 2024)

*   **Curated Catalogs**: Added specific, curated catalogs for:
    *   DCEU Movies
    *   Modern DC Series (Live-Action, 2010s-Present)
    *   All Batman Movies (Live-Action & Serials)
    *   All Superman Movies (Live-Action & Serials)
*   **Improved Data Quality**: Items without essential metadata (poster image, overview) are now filtered out during data generation.
*   **Catalog Reordering**: Catalogs are now ordered more logically in the Stremio interface.
*   **Manifest Update**: Catalogs now use the `DC` type for better grouping in Stremio.

---

## 📦 Installation

### Standard Installation

Install directly from Stremio addon catalog or use this URL:
```
https://addon-dc.vercel.app/manifest.json
```

### Custom Catalog Configuration

Create your personalized DC Universe addon with only the catalogs you want:

1. Visit the configuration page: `https://addon-dc.vercel.app/configure`
2. Select the catalogs you want to include in your addon
3. Click the "Generate Installation Link" button
4. Use the generated link to install the addon in Stremio

## Running Locally

### Prerequisites
- Node.js and npm installed

### Setup
1. Clone the repository:
```
git clone https://github.com/tapframe/addon-dc.git
cd addon-dc
```

2. Install dependencies:
```
npm install
```

3. Create a `.env` file with your API keys:
```
TMDB_API_KEY=your_tmdb_key
OMDB_API_KEY=your_omdb_key
PORT=7000
```

4. Start the server:

For the standard Stremio SDK server:
```
npm start
```

For the Express server with custom catalog support:
```
npm run start:server
```

5. The addon will be available at:
   - Standard SDK: `http://localhost:7000/manifest.json`
   - Express server: `http://localhost:7000/configure` (configuration page)

## Custom Catalog Support

The Express server version allows you to create personalized catalog selections. The URL format is:

```
http://localhost:7000/catalog/SELECTED-CATALOG-IDS/manifest.json
```

Where `SELECTED-CATALOG-IDS` is a comma-separated list of catalog IDs you want to include, such as:
```
dc-chronological,dc-movies,dc-batman
```

## Available Catalogs

- **dc-chronological**: DC Universe in chronological order
- **dc-release**: DC Universe in release order
- **dc-movies**: All DC movies
- **dceu_movies**: DCEU movies only
- **dc-series**: All DC series
- **dc_modern_series**: Modern DC series
- **dc-animations**: All DC animations
- **dc-batman-animations**: Batman animations
- **dc-superman-animations**: Superman animations
- **dc-batman**: Batman movie collection
- **dc-superman**: Superman movie collection

## Development

This addon uses:
- The Movie Database (TMDb) API for metadata
- OMDb API for additional movie information
- Stremio Addon SDK for standard addon functionality
- Express.js for the custom server with catalog customization

## License

This project is under the MIT License.

---

## 🙏 Acknowledgements

This addon is a modified fork of the original Marvel addon created by **joaogonp**. Many thanks for the initial work!

---

## ☕ Support

If you find this addon useful, you can support its development:

[Buy Me a Coffee🍺](https://buymeacoffee.com/tapframe)

---

## 📬 Feedback

Issues, suggestions, or questions? Open an issue.
