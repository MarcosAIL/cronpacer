import dotenv from 'dotenv';
// Cargar variables de entorno ANTES de cualquier import que use process.env
dotenv.config();

import path from 'path';
import express from 'express';
import routes from './routes';
import './worker'; // Iniciar el trabajador en segundo plano

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware para que Express entienda el JSON que mandan los clientes
app.use(express.json());

// Servir archivos estáticos del Dashboard (HTML, CSS, JS)
app.use(express.static(path.join(__dirname, 'public')));

// Montar nuestras rutas en el prefijo /api
app.use('/api', routes);

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor API (Gateway) corriendo en http://localhost:${PORT}`);
  console.log(`📊 Dashboard disponible en http://localhost:${PORT}`);
});
