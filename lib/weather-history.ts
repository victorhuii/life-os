import {z} from "zod";
import {weatherLocations,type WeatherLocation} from "./weather";
export type WeatherHistory={location:string;fetchedAt:string;source:string;sourceUrl:string;stale?:boolean;hours:{at:string;temperature:number|null;code:number}[]};
const schema=z.object({hourly:z.object({time:z.array(z.number().finite()),temperature_2m:z.array(z.number().nullable()),weather_code:z.array(z.number())})});
export function parseWeatherHistory(value:unknown,location:WeatherLocation,now=new Date()):WeatherHistory {
  const {hourly}=schema.parse(value);
  if(hourly.time.length!==hourly.temperature_2m.length||hourly.time.length!==hourly.weather_code.length)throw Error('Incomplete weather history.');
  return {location:weatherLocations[location].name,fetchedAt:now.toISOString(),source:'Open-Meteo',sourceUrl:'https://open-meteo.com/en/docs?past_days=1',hours:hourly.time.map((time,i)=>({at:new Date(time*1000).toISOString(),temperature:hourly.temperature_2m[i],code:hourly.weather_code[i]}))};
}
