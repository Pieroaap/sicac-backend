import Fastify from 'fastify';
import cors from '@fastify/cors';
import dotenv from 'dotenv';

import dbPlugin from './plugins/db.plugin.js';
import authPlugin from './plugins/auth.plugin.js';
import swaggerPlugin from './plugins/swagger.plugin.js';

import { authRoutes } from './routes/auth.routes.js';
import { usuariosRoutes } from './routes/usuarios.routes.js';
import { academicoRoutes } from './routes/academico.routes.js';
import { cursosProgramadosRoutes } from './routes/cursos-programados.routes.js';
import { matriculasRoutes } from './routes/matriculas.routes.js';
import { asistenciasRoutes } from './routes/asistencias.routes.js';

dotenv.config();

const app = Fastify({ logger: true });

// Registro de Plugins
app.register(cors, { origin: true });
app.register(dbPlugin);
app.register(authPlugin);
app.register(swaggerPlugin);

// Registro de Rutas
app.register(authRoutes, { prefix: '/api/auth' });
app.register(usuariosRoutes, { prefix: '/api/usuarios' });
app.register(academicoRoutes, { prefix: '/api/academico' });
app.register(cursosProgramadosRoutes, { prefix: '/api/cursos-programados' });
app.register(matriculasRoutes, { prefix: '/api/matriculas' });
app.register(asistenciasRoutes, { prefix: '/api/asistencias' });

// Ruta raíz de comprobación
app.get('/', async () => {
    return { system: 'SICAC Backend', status: 'Running' };
});

// Inicio del servidor
const start = async () => {
    try {
        const port = Number(process.env.PORT) || 3000;
        await app.listen({ port, host: '0.0.0.0' });
        console.log(`Servidor escuchando en el puerto ${port}`);
    } catch (err) {
        app.log.error(err);
        process.exit(1);
    }
};

start();