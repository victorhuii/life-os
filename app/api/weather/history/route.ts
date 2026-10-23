import {database,response,save} from "@/lib/store";
import {dayKey} from "@/lib/life";
import {weatherLocations,type WeatherLocation} from "@/lib/weather";
import {parseWeatherHistory,type WeatherHistory} from "@/lib/weather-history";
export const dynamic='force-dynamic';
export async function GET(request:Request){
  const key=new URL(request.url).searchParams.get('location')||'berkeley';
  if(!Object.hasOwn(weatherLocations,key))return response({error:'Choose a supported location.'},400);
  const location=key as WeatherLocation,id=`weather-history:${location}:${dayKey()}`;
  const row=await database().prepare('SELECT payload FROM life_records WHERE id=?').bind(id).first<{payload:string}>();
  const cached:WeatherHistory|null=row?JSON.parse(row.payload):null;
  if(cached&&Date.now()-Date.parse(cached.fetchedAt)<3600000)return response(cached);
  const {latitude,longitude}=weatherLocations[location];
  const params=new URLSearchParams({latitude:String(latitude),longitude:String(longitude),hourly:'temperature_2m,weather_code',temperature_unit:'fahrenheit',timezone:'America/Los_Angeles',timeformat:'unixtime',past_days:'1',forecast_days:'1'});
  try{const result=await fetch('https://api.open-meteo.com/v1/forecast?'+params,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(12000)});if(!result.ok)throw Error('Weather provider unavailable.');const weather=parseWeatherHistory(await result.json(),location);await save(id,'weather_cache',weather);return response(weather);}
  catch{return cached?response({...cached,stale:true}):response({error:'Weather for this period is temporarily unavailable.'},503);}
}
