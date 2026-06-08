import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createClient } from '@supabase/supabase-js';
import fastifyJwt from '@fastify/jwt';

async function authPlugin(app: FastifyInstance) {
    // Configurar JWT de Fastify para que verifique los tokens de Supabase
    app.register(fastifyJwt, {
        secret: process.env.JWT_SECRET || 'secreto', // En Supabase Settings > API > JWT Secret
    });

    // Crear cliente Supabase (usará Service Role Key si está disponible para permitir operaciones de admin)
    const supabase = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY!
    );

    // Decorador para el login de prueba (Solo desarrollo)
    app.decorate('supabase', supabase);

    // Middleware de autenticación (Verifica el token de Supabase)
    app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const authHeader = request.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return reply.status(401).send({ error: 'No autorizado: Falta token' });
            }
            const token = authHeader.split(' ')[1];

            // Validar token directamente contra la API de Supabase Auth (resuelve temas de claves asimétricas ES256)
            const { data: { user: supabaseUser }, error } = await app.supabase.auth.getUser(token);

            if (error || !supabaseUser) {
                return reply.status(401).send({ error: 'Token inválido o expirado', detalle: error?.message });
            }

            // Buscamos nuestro usuario interno usando el auth_user_id
            const user = await app.db.query.usuarios.findFirst({
                where: (u, { eq }) => eq(u.authUserId, supabaseUser.id),
                with: { roles: { with: { rol: true } } }
            });

            if (!user || !user.activo) {
                return reply.status(401).send({ error: 'Usuario no encontrado o inactivo en el sistema' });
            }

            // Inyectamos nuestro perfil completo en la request
            request.user = {
                id: user.id,
                authUserId: user.authUserId,
                email: user.email,
                roles: user.roles.map(ur => ur.rol.nombre)
            };

        } catch (err) {
            return reply.status(401).send({ error: 'Token inválido o expirado', detalle: err });
        }
    });

    // Middleware de Autorización RBAC
    app.decorate('authorize', (...rolesPermitidos: string[]) => {
        return async (request: FastifyRequest, reply: FastifyReply) => {
            const user = request.user as any;
            if (!user || !user.roles) {
                return reply.status(403).send({ error: 'Prohibido: Sin roles asignados' });
            }
            const tienePermiso = user.roles.some((r: string) => rolesPermitidos.includes(r));
            if (!tienePermiso) {
                return reply.status(403).send({ error: 'Prohibido: Rol insuficiente' });
            }
        };
    });
}

export default fp(authPlugin);

declare module 'fastify' {
    interface FastifyInstance {
        supabase: any;
        authenticate: any;
        authorize: (...roles: string[]) => any;
    }
    interface FastifyRequest {
        user: any;
    }
}