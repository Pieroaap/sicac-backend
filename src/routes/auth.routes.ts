import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { usuarios } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { buildMenuTree } from '../services/menu.service.js';
import { handleDBError } from '../utils/errors.js';

export const authRoutes: FastifyPluginAsync = async (app) => {

    // Ruta para registrar usuarios en desarrollo (Supabase Auth + BD Local)
    app.post('/dev-register', {
        schema: {
            description: 'Registrar un nuevo usuario en Supabase Auth y vincular su perfil local en la BD (Desarrollo)',
            tags: ['Autenticación'],
            body: {
                type: 'object',
                required: ['email', 'password', 'nombre', 'apellido'],
                properties: {
                    email: { type: 'string', format: 'email' },
                    password: { type: 'string', minLength: 6 },
                    nombre: { type: 'string' },
                    apellido: { type: 'string' }
                }
            },
            response: {
                201: {
                    type: 'object',
                    properties: {
                        message: { type: 'string' },
                        user: {
                            type: 'object',
                            properties: {
                                id: { type: 'string', format: 'uuid' },
                                authUserId: { type: 'string', format: 'uuid' },
                                email: { type: 'string' },
                                nombre: { type: 'string' },
                                apellido: { type: 'string' }
                            }
                        }
                    }
                },
                400: {
                    type: 'object',
                    properties: {
                        error: { type: 'string' }
                    }
                }
            }
        }
    }, async (request, reply) => {
        const { email, password, nombre, apellido } = request.body as any;

        // 1. Crear el usuario en Supabase Auth
        const { data, error } = await app.supabase.auth.signUp({
            email,
            password,
        });

        if (error || !data.user) {
            return reply.status(400).send({ error: `Error en Supabase Auth: ${error?.message || 'No se pudo crear el usuario'}` });
        }

        try {
            // 2. Verificar si el trigger automático de Supabase ya creó el perfil
            let perfil = await app.db.query.usuarios.findFirst({
                where: eq(usuarios.authUserId, data.user.id)
            });

            if (perfil) {
                // Si el trigger ya lo creó (generalmente con "Sin Nombre"), actualizamos con los datos reales
                const [actualizado] = await app.db.update(usuarios)
                    .set({ nombre, apellido, activo: true })
                    .where(eq(usuarios.authUserId, data.user.id))
                    .returning();
                perfil = actualizado;
            } else {
                // Si no hay trigger activo, lo insertamos manualmente
                const [nuevo] = await app.db.insert(usuarios).values({
                    authUserId: data.user.id,
                    email,
                    nombre,
                    apellido,
                    activo: true
                }).returning();
                perfil = nuevo;
            }

            return reply.status(201).send({
                message: 'Usuario creado en Supabase Auth y vinculado en la base de datos local.',
                user: perfil
            });
        } catch (dbError) {
            return handleDBError(reply, dbError);
        }
    });

    // Ruta temporal para DESARROLLO: Nos permite loguearnos vía Swagger sin Frontend
    app.post('/dev-login', {
        schema: {
            description: 'Iniciar sesión de desarrollo usando Supabase Auth',
            tags: ['Autenticación'],
            body: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                    email: { type: 'string', format: 'email' },
                    password: { type: 'string' }
                }
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        token: { type: 'string', description: 'JWT de Supabase para Bearer Auth' },
                        user: {
                            type: 'object',
                            properties: {
                                id: { type: 'string', format: 'uuid' },
                                nombre: { type: 'string' },
                                apellido: { type: 'string' },
                                roles: { type: 'array', items: { type: 'string' } }
                            }
                        },
                        menus: { type: 'array', items: { type: 'object', additionalProperties: true } }
                    }
                },
                401: {
                    type: 'object',
                    properties: {
                        error: { type: 'string' }
                    }
                },
                404: {
                    type: 'object',
                    properties: {
                        error: { type: 'string' }
                    }
                }
            }
        }
    }, async (request, reply) => {
        const { email, password } = request.body as any;

        // Usamos Supabase para validar las credenciales reales
        const { data, error } = await app.supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error || !data.user) {
            return reply.status(401).send({ error: 'Credenciales inválidas en Supabase Auth' });
        }

        // Si Supabase dice que está OK, buscamos el perfil en nuestra BD
        const user = await app.db.query.usuarios.findFirst({
            where: eq(usuarios.authUserId, data.user.id),
            with: { roles: { with: { rol: { with: { menus: { with: { menu: true } } } } } } }
        });

        if (!user) return reply.status(404).send({ error: 'Usuario autenticado pero sin perfil en public.usuarios' });

        const roles = user.roles.map(ur => ur.rol.nombre);
        const menuSet = new Set<string>();
        const menuItems: any[] = [];
        user.roles.forEach(ur => {
            ur.rol.menus.forEach(rm => {
                if (!menuSet.has(rm.menu.id) && rm.menu.activo) {
                    menuSet.add(rm.menu.id);
                    menuItems.push(rm.menu);
                }
            });
        });

        // Devolvemos el JWT real de Supabase para usar en Swagger
        return {
            token: data.session.access_token,
            user: { id: user.id, nombre: user.nombre, apellido: user.apellido, roles },
            menus: buildMenuTree(menuItems)
        };
    });

    // Ruta para saber quién está logueado
    app.get('/me', {
        schema: {
            description: 'Obtener información y menús del usuario autenticado',
            tags: ['Autenticación'],
            security: [{ bearerAuth: [] }],
            response: {
                200: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid' },
                        email: { type: 'string' },
                        roles: { type: 'array', items: { type: 'string' } },
                        requiereCambioClave: { type: 'boolean' },
                        menus: { type: 'array', items: { type: 'object', additionalProperties: true } }
                    }
                },
                404: {
                    type: 'object',
                    properties: {
                        error: { type: 'string' }
                    }
                }
            }
        },
        preHandler: [app.authenticate]
    }, async (request, reply) => {
        const user = request.user as any;
        // Obtener menús del usuario logueado
        const dbUser = await app.db.query.usuarios.findFirst({
            where: eq(usuarios.id, user.id),
            with: { roles: { with: { rol: { with: { menus: { with: { menu: true } } } } } } }
        });
        if (!dbUser) return reply.status(404).send({ error: 'Perfil no encontrado' });

        // ARMADILLO DE SEGURIDAD: Si requiere cambio de clave, bloqueamos los menús principales
        // y el frontend mostrará solo la vista de cambio de clave
        if (dbUser.requiereCambioClave) {
            return {
                id: dbUser.id,
                email: dbUser.email,
                roles: dbUser.roles.map(ur => ur.rol.nombre),
                requiereCambioClave: true, // ESTO ES LO QUE LEE EL FRONTEND
                menus: [] // No le damos acceso a nada más
            };
        }

        const menuSet = new Set<string>();
        const menuItems: any[] = [];
        dbUser.roles.forEach((ur: any) => {
            ur.rol.menus.forEach((rm: any) => {
                if (!menuSet.has(rm.menu.id) && rm.menu.activo) {
                    menuSet.add(rm.menu.id);
                    menuItems.push(rm.menu);
                }
            });
        });

        return { ...user, requiereCambioClave: false, menus: buildMenuTree(menuItems) };
    });

    app.put('/cambiar-clave', {
        schema: {
            description: 'Cambiar la contraseña del usuario autenticado',
            tags: ['Autenticación'],
            security: [{ bearerAuth: [] }],
            body: {
                type: 'object',
                required: ['nuevaClave'],
                properties: {
                    nuevaClave: { type: 'string', minLength: 6 }
                }
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        message: { type: 'string' }
                    }
                },
                400: {
                    type: 'object',
                    properties: {
                        error: { type: 'string' }
                    }
                },
                500: {
                    type: 'object',
                    properties: {
                        error: { type: 'string' }
                    }
                }
            }
        },
        preHandler: [app.authenticate]
    }, async (request, reply) => {
        const { nuevaClave } = request.body as any;
        const authUserId = (request.user as any).authUserId;

        if (!authUserId) {
            return reply.status(400).send({ error: 'No se encontró un ID de autenticación en la sesión' });
        }

        try {
            // 1. Actualizar en Supabase Auth
            const { error } = await app.supabase.auth.admin.updateUserById(authUserId, { password: nuevaClave });
            if (error) {
                return reply.status(500).send({ error: `Error al actualizar la clave en Supabase: ${error.message}` });
            }

            // 2. Quitar la bandera en nuestra BD
            await app.db.update(usuarios)
                .set({ requiereCambioClave: false })
                .where(eq(usuarios.id, (request.user as any).id));

            return { message: 'Clave actualizada correctamente' };
        } catch (err) {
            return reply.status(500).send({ error: 'Error interno al actualizar la clave' });
        }
    });
};