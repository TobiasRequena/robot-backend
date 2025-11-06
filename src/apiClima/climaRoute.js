import express from 'express';
import { guardarClima } from './clima.js';

const router = express.Router();

router.get('/datosClimaVm', async (req, res) => {
    try {
        const datosClima = await guardarClima();
        res.status(200).json({ 
            message: 'Datos del clima guardados correctamente',
            datos: datosClima
        });
    } catch (error) {
        console.error('Error en /clima/datosClimaVm:', error.message);
        res.status(500).json({
            error: 'Error al obtener los datos del clima' });
    }
});

export default router;