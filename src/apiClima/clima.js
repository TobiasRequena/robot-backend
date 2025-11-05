import dotenv from 'dotenv';
dotenv.config();
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);
const weatherApi = process.env.WEATHER_API_KEY;
const ciudad = 'Villa Maria, Cordoba, Argentina';

export const guardarClima = async () => {
    try {
        const url = `http://api.weatherapi.com/v1/current.json?key=${weatherApi}&q=${ciudad}&aqi=no`;
        const { data } = await axios.get(url);

        const clima = data.current;
        const loc = data.location;

        const nuevoRegistro = {
            ciudad: loc.name,
            region: loc.region,
            pais: loc.country,
            latitud: loc.lat,              
            longitud: loc.lon,             
            temperatura_c: clima.temp_c,
            condicion: clima.condition.text,
            icono: clima.condition.icon,   
            viento_kph: clima.wind_kph,
            presion_mb: clima.pressure_mb,
            humedad: clima.humidity,
            nubosidad: clima.cloud,      
            sensacion_termica_c: clima.feelslike_c,
            visibilidad_km: clima.vis_km,
            fecha_lectura: new Date().toISOString()
        };

        const { error } = await supabase.from('historial_clima').insert([nuevoRegistro]);

        if (error) {
            console.error('Error al guardar los datos en supabase:', error.message);
            throw new Error('Error al guardar en supabase');
        } else {
            console.log('✅ Registro del clima guardado correctamente');
            return nuevoRegistro;
        }
    } catch (err) {
        console.error("Error al consultar a la API:", err.message);
        throw err;
    }
};

