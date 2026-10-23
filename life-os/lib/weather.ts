import { z } from "zod";
export const weatherLocations = { berkeley: { name: "Berkeley", latitude: 37.8715, longitude: -122.273 }, sf: { name: "San Francisco", latitude: 37.7749, longitude: -122.4194 }, millbrae: { name: "Millbrae", latitude: 37.5985, longitude: -122.3872 } } as const;
export type WeatherLocation = keyof typeof weatherLocations;
export type Weather = { location: string; temperature: number; feelsLike: number | null; code: number; isDay: boolean; wind: number | null; observedAt: string; fetchedAt: string; stale: boolean; source: string; sourceUrl: string; reading: "current" | "forecast"; observationLabel?: string; condition?: string; error?: string; days: { date: string; high: number | null; low: number | null; rain: number | null; code: number }[]; hours: { at: string; temperature: number | null; code: number }[] };
export const weatherSchema = z.object({
  current: z.object({ time: z.number(), temperature_2m: z.number(), apparent_temperature: z.number(), weather_code: z.number(), is_day: z.number(), wind_speed_10m: z.number() }),
  daily: z.object({ time: z.array(z.number()), temperature_2m_max: z.array(z.number().nullable()), temperature_2m_min: z.array(z.number().nullable()), precipitation_probability_max: z.array(z.number().nullable()), weather_code: z.array(z.number()) }),
  hourly: z.object({ time: z.array(z.number()), temperature_2m: z.array(z.number().nullable()), weather_code: z.array(z.number()) }),
});
export function parseWeather(data: unknown, location: WeatherLocation, now = new Date()): Weather {
  const d = weatherSchema.parse(data);
  return { location: weatherLocations[location].name, temperature: d.current.temperature_2m, feelsLike: d.current.apparent_temperature, code: d.current.weather_code, isDay: d.current.is_day === 1, wind: d.current.wind_speed_10m, observedAt: new Date(d.current.time * 1000).toISOString(), fetchedAt: now.toISOString(), stale: false, source: "Open-Meteo", sourceUrl: "https://open-meteo.com/", reading: "current",
    days: d.daily.time.slice(0, 3).map((t, i) => ({ date: new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(t * 1000)), high: d.daily.temperature_2m_max[i], low: d.daily.temperature_2m_min[i], rain: d.daily.precipitation_probability_max[i], code: d.daily.weather_code[i] })),
    hours: d.hourly.time.map((t, i) => ({ at: new Date(t * 1000).toISOString(), temperature: d.hourly.temperature_2m[i], code: d.hourly.weather_code[i] })).filter(h => new Date(h.at) >= now).slice(0, 8),
  };
}
export function weatherLabel(code: number) { if (code === 0) return "Clear"; if (code <= 2) return "Partly cloudy"; if (code === 3) return "Cloudy"; if (code <= 48) return "Fog"; if (code <= 57) return "Drizzle"; if (code <= 67) return "Rain"; if (code <= 77) return "Snow"; if (code <= 82) return "Showers"; if (code <= 86) return "Snow showers"; return "Thunderstorms"; }
