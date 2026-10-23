import { response, database, save } from "@/lib/store";
import { parseWeather, weatherLocations, type Weather, type WeatherLocation } from "@/lib/weather";
import { fetchNwsWeather } from "@/lib/weather-nws";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const key = new URL(request.url).searchParams.get("location") || "berkeley";
  if (!Object.hasOwn(weatherLocations, key)) return response({ error: "Choose a supported location." }, 400);
  const location = key as WeatherLocation;
  const cachedRow = await database().prepare("SELECT payload FROM life_records WHERE id=?").bind(`weather:${location}`).first<{ payload: string }>();
  const cached = cachedRow ? JSON.parse(cachedRow.payload) as Weather : null;
  if (cached && Date.now() - new Date(cached.fetchedAt).getTime() < 15 * 60000) return response(cached);
  const { latitude, longitude } = weatherLocations[location];
  const params = new URLSearchParams({ latitude: String(latitude), longitude: String(longitude), current: "temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m", hourly: "temperature_2m,weather_code", daily: "temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code", temperature_unit: "fahrenheit", wind_speed_unit: "mph", timezone: "America/Los_Angeles", timeformat: "unixtime", forecast_days: "3" });
  try {
    const result = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { headers: { Accept: "application/json", "User-Agent": "LifeOS/1.0 (https://victor-life-os.heartyaspen1.chatgpt.site)" }, signal: AbortSignal.timeout(12000) });
    if (!result.ok) throw new Error(`Forecast provider HTTP ${result.status}`);
    const weather = parseWeather(await result.json(), location);
    await save(`weather:${location}`, "weather_cache", weather);
    return response(weather);
  } catch (caught) {
    console.warn("Primary weather provider unavailable", caught instanceof Error ? caught.message : "Unknown error");
    try {
      const weather = await fetchNwsWeather(location);
      await save(`weather:${location}`, "weather_cache", weather);
      return response(weather);
    } catch (fallbackError) { console.error("Weather refresh failed", fallbackError instanceof Error ? fallbackError.message : "Unknown error"); }
    return cached ? response({ ...cached, stale: true, error: "Weather refresh failed. Showing the last update." }) : response({ error: "Weather is temporarily unavailable. Try refreshing shortly." }, 503);
  }
}
