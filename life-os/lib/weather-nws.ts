import { z } from "zod";
import { dayKey } from "./life";
import { weatherLocations, type Weather, type WeatherLocation } from "./weather";
const periodSchema = z.object({ startTime: z.string().datetime({ offset: true }), endTime: z.string().datetime({ offset: true }), isDaytime: z.boolean(), temperature: z.number(), temperatureUnit: z.enum(["F", "C"]), shortForecast: z.string(), probabilityOfPrecipitation: z.object({ value: z.number().nullable() }).optional() });
const forecastSchema = z.object({ properties: z.object({ updated: z.string().optional(), periods: z.array(periodSchema).min(1) }) });
const quantity = z.object({ value: z.number().nullable(), unitCode: z.string() });
const observationSchema = z.object({ properties: z.object({ timestamp: z.string().datetime({ offset: true }), temperature: quantity, textDescription: z.string(), stationName: z.string().optional(), heatIndex: quantity.optional(), windChill: quantity.optional(), windSpeed: quantity.optional() }) });
const stations = { berkeley: "KOAK", sf: "KSFO", millbrae: "KSFO" };
const toF = (value: number, unit: "C" | "F") => unit === "C" ? value * 9 / 5 + 32 : value;
function quantityF(value?: z.infer<typeof quantity>) { return !value || value.value === null ? null : value.unitCode.endsWith(":degC") ? toF(value.value, "C") : value.unitCode.endsWith(":degF") ? value.value : null; }
function conditionCode(value: string) { const text = value.toLowerCase(); if (/thunder/.test(text)) return 95; if (/snow|sleet|ice/.test(text)) return 73; if (/showers/.test(text)) return 80; if (/rain/.test(text)) return 61; if (/drizzle/.test(text)) return 51; if (/fog|mist|haze/.test(text)) return 45; if (/mostly cloudy|cloudy|overcast/.test(text) && !/partly/.test(text)) return 3; if (/partly|mostly sunny/.test(text)) return 2; return 0; }
export function nwsUrl(value: string) { const url = new URL(value); if (url.protocol !== "https:" || url.hostname !== "api.weather.gov" || url.port || url.username || url.password || !/^\/(points|gridpoints|stations)\//.test(url.pathname)) throw new Error("Invalid NWS endpoint"); return url.href; }

export function parseNwsWeather(forecastInput: unknown, hourlyInput: unknown, observationInput: unknown, location: WeatherLocation, now = new Date()): Weather {
  const forecast = forecastSchema.parse(forecastInput).properties;
  const hourly = forecastSchema.parse(hourlyInput).properties;
  const periods = hourly.periods.filter(p => new Date(p.endTime) > now);
  const current = periods[0]; if (!current) throw new Error("NWS hourly forecast is expired");
  const result = observationSchema.safeParse(observationInput);
  const observation = result.success ? result.data.properties : null;
  const observedTemperature = quantityF(observation?.temperature);
  const age = observation ? now.getTime() - new Date(observation.timestamp).getTime() : Infinity;
  const useObservation = observedTemperature !== null && age >= -60 * 60000 && age <= 2 * 60 * 60000;
  const days = new Map<string, Weather["days"][number]>();
  for (const period of forecast.periods) {
    const date = dayKey(new Date(period.startTime)); if (date < dayKey(now)) continue;
    const row = days.get(date) || { date, high: null, low: null, rain: null, code: conditionCode(period.shortForecast) };
    if (period.isDaytime) { row.high = toF(period.temperature, period.temperatureUnit); row.code = conditionCode(period.shortForecast); }
    else row.low = toF(period.temperature, period.temperatureUnit);
    const rain = period.probabilityOfPrecipitation?.value;
    if (rain !== null && rain !== undefined) row.rain = Math.max(row.rain ?? 0, rain);
    days.set(date, row);
  }
  const wind = observation?.windSpeed;
  const windMph = wind?.value == null ? null : wind.unitCode.endsWith(":km_h-1") ? wind.value / 1.609344 : wind.unitCode.endsWith(":m_s-1") ? wind.value * 2.236936 : wind.unitCode.endsWith(":mi_h-1") ? wind.value : null;
  const condition = useObservation ? observation!.textDescription : current.shortForecast;
  return { location: weatherLocations[location].name, temperature: useObservation ? observedTemperature! : toF(current.temperature, current.temperatureUnit), feelsLike: useObservation ? quantityF(observation?.heatIndex) ?? quantityF(observation?.windChill) : null, wind: useObservation ? windMph : null, code: conditionCode(condition), isDay: current.isDaytime, condition, observedAt: useObservation ? observation!.timestamp : current.startTime, fetchedAt: now.toISOString(), stale: false, source: "National Weather Service", sourceUrl: "https://www.weather.gov/", reading: useObservation ? "current" : "forecast", observationLabel: useObservation ? `Nearby observation · ${observation?.stationName || stations[location]}` : "Current-hour forecast; a recent station observation is unavailable.", days: [...days.values()].slice(0, 3), hours: periods.slice(0, 8).map(period => ({ at: period.startTime, temperature: toF(period.temperature, period.temperatureUnit), code: conditionCode(period.shortForecast) })) };
}

export async function fetchNwsWeather(location: WeatherLocation) {
  const headers = { Accept: "application/geo+json", "User-Agent": "LifeOS/1.0 (https://victor-life-os.heartyaspen1.chatgpt.site)" };
  async function read(url: string) { const result = await fetch(nwsUrl(url), { headers, signal: AbortSignal.timeout(12000) }); if (!result.ok) throw new Error(`NWS HTTP ${result.status}`); return result.json(); }
  const city = weatherLocations[location];
  const point = z.object({ properties: z.object({ forecast: z.string().url(), forecastHourly: z.string().url() }) }).parse(await read(`https://api.weather.gov/points/${city.latitude},${city.longitude}`)).properties;
  const [forecast, hourly, observation] = await Promise.allSettled([read(point.forecast), read(point.forecastHourly), read(`https://api.weather.gov/stations/${stations[location]}/observations/latest`)]);
  if (forecast.status === "rejected" || hourly.status === "rejected") throw new Error("NWS forecast unavailable");
  return parseNwsWeather(forecast.value, hourly.value, observation.status === "fulfilled" ? observation.value : null, location);
}
