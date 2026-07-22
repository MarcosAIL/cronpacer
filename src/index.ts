import express from 'express';
import dotenv from 'dotenv';
import routes from './routes';
import './worker'; // Iniciar el trabajador en segundo plano

// Cargar variables de entorno (si las hay)
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware para que Express entienda el JSON que mandan los clientes
app.use(express.json());

// Montar nuestras rutas en el prefijo /api
app.use('/api', routes);

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor API (Gateway) corriendo en http://localhost:${PORT}`);
});
