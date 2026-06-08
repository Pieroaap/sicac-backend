import fp from 'fastify-plugin';
import { db } from '../db/index.js';

async function dbPlugin(app: any) {
    app.decorate('db', db);
}

export default fp(dbPlugin);

declare module 'fastify' {
    interface FastifyInstance {
        db: typeof db;
    }
}