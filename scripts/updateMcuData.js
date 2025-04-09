import requests
import json
import os

TMDB_API_KEY = os.getenv("TMDB_API_KEY")
OMDB_API_KEY = os.getenv("OMDB_API_KEY")
TMDB_BASE_URL = "https://api.themoviedb.org/3"
OMDB_BASE_URL = "http://www.omdbapi.com/"

def fetch_mcu_collection():
    response = requests.get(f"{TMDB_BASE_URL}/collection/535313?api_key={TMDB_API_KEY}")
    return response.json()["parts"] if response.status_code == 200 else []

def fetch_upcoming():
    movies = requests.get(f"{TMDB_BASE_URL}/movie/upcoming?api_key={TMDB_API_KEY}").json()["results"]
    series = requests.get(f"{TMDB_BASE_URL}/tv/on_the_air?api_key={TMDB_API_KEY}").json()["results"]
    marvel_keywords = ["Marvel", "MCU", "Avengers", "Spider-Man"]
    upcoming = []
    for item in movies + series:
        title = item.get("title") or item.get("name")
        if any(kw in title.lower() or kw in item.get("overview", "").lower() for kw in marvel_keywords):
            upcoming.append(item)
    return upcoming

def fetch_omdb_data(title):
    response = requests.get(f"{OMDB_BASE_URL}?t={title}&apikey={OMDB_API_KEY}")
    return response.json() if response.status_code == 200 and response.json().get("Response") == "True" else None

def load_existing_data():
    try:
        with open("mcudata.json", "r") as f:
            return json.load(f)
    except FileNotFoundError:
        return []

def generate_mcu_data():
    existing_data = load_existing_data()
    existing_ids = {item["id"] for item in existing_data}
    
    # Buscar filmes e séries
    movies = fetch_mcu_collection()
    upcoming = fetch_upcoming()
    mcu_data = existing_data

    for item in movies + upcoming:
        title = item.get("title") or item.get("name")
        tmdb_id = str(item["id"])
        if tmdb_id in existing_ids:
            continue
        
        # Ignorar animações, exceto What If...?
        if "animation" in [g["name"].lower() for g in item.get("genres", [])] and title != "What If...?":
            continue

        year = (item.get("release_date") or item.get("first_air_date") or "TBA")[:4]
        omdb_data = fetch_omdb_data(title)
        
        entry = {
            "id": f"tt{omdb_data['imdbID']}" if omdb_data and omdb_data.get("imdbID") else f"tmdb-{tmdb_id}",
            "name": title,
            "type": "movie" if "release_date" in item else "series",
            "year": year,
            "poster": f"https://image.tmdb.org/t/p/w500{item['poster_path']}" if item.get("poster_path") else None
        }
        mcu_data.append(entry)
        existing_ids.add(tmdb_id)

    with open("mcudata.json", "w") as f:
        json.dump(mcu_data, f, indent=2)
    print(f"Gerado: {len(mcu_data)} itens")

if __name__ == "__main__":
    if not TMDB_API_KEY or not OMDB_API_KEY:
        print("Erro: API keys não definidas")
    else:
        generate_mcu_data()
