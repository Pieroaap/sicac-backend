import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { usuarios, usuarioRoles, roles } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { handleDBError } from '../utils/errors.js';

export const usuariosRoutes: FastifyPluginAsync = async (app) => {
    app.post('/', {
        schema: {
            description: 'Crear un nuevo usuario (ADMIN o GESTOR)',
            tags: ['Usuarios'],
            security: [{ bearerAuth: [] }],
            body: {
                type: 'object',
                required: ['email', 'password', 'nombre', 'apellido', 'rolNombre'],
                properties: {
                    email: { type: 'string', format: 'email' },
                    password: { type: 'string', minLength: 6 },
                    nombre: { type: 'string' },
                    apellido: { type: 'string' },
                    dni: { type: 'string' },
                    telefono: { type: 'string' },
                    domicilio: { type: 'string' },
                    fechaNacimiento: { type: 'string' },
                    rolNombre: { type: 'string' }
                }
            },
            response: {
                201: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid' },
                        email: { type: 'string' }
                    }
                },
                400: {
                    type: 'object',
                    properties: {
                        error: { type: 'string' }
                    }
                },
                403: {
                    type: 'object',
                    properties: {
                        error: { type: 'string' }
                    }
                }
            }
        },
        preHandler: [app.authenticate, app.authorize('ADMIN', 'GESTOR')]
    }, async (request, reply) => {
        const { email, password, nombre, apellido, dni, telefono, domicilio, fechaNacimiento, rolNombre } = request.body as any;
        const currentUser = request.user as any;

        // REGLA DE NEGOCIO: El gestor no puede crear Admines ni otros Gestores
        if (currentUser.roles.includes('GESTOR') && ['ADMIN', 'GESTOR'].includes(rolNombre)) {
            return reply.status(403).send({ error: 'No tienes permiso para crear usuarios con este rol.' });
        }

        try {
            // 1. Crear usuario en Supabase Auth (Usando Service Role Key en el backend)
            const { data: authData, error: authError } = await app.supabase.auth.admin.createUser({
                email,
                password,
                email_confirm: true,
            });

            if (authError || !authData.user) {
                return reply.status(400).send({ error: `Error en Supabase Auth: ${authError?.message || 'No se pudo crear el usuario'}` });
            }

            // 2. Crear o actualizar perfil en nuestra BD para evitar conflicto con el trigger de Supabase
            let nuevoUsuario: any;
            const perfilExistente = await app.db.query.usuarios.findFirst({
                where: eq(usuarios.authUserId, authData.user.id)
            });

            if (perfilExistente) {
                const [actualizado] = await app.db.update(usuarios)
                    .set({
                        email,
                        nombre,
                        apellido,
                        dni,
                        telefono,
                        domicilio,
                        fechaNacimiento,
                        requiereCambioClave: true,
                        activo: true
                    })
                    .where(eq(usuarios.authUserId, authData.user.id))
                    .returning();
                nuevoUsuario = actualizado;
            } else {
                const [nuevo] = await app.db.insert(usuarios).values({
                    authUserId: authData.user.id,
                    email,
                    nombre,
                    apellido,
                    dni,
                    telefono,
                    domicilio,
                    fechaNacimiento,
                    requiereCambioClave: true, // FORZAR CAMBIO EN PRIMER LOGIN
                    activo: true
                }).returning();
                nuevoUsuario = nuevo;
            }

            // 3. Asignar Rol
            const rol = await app.db.query.roles.findFirst({ where: eq(roles.nombre, rolNombre) });
            if (rol) {
                await app.db.insert(usuarioRoles).values({
                    usuarioId: nuevoUsuario.id,
                    rolId: rol.id,
                    estado: 'Activo' // Estado inicial del rol
                });
            }

            return reply.status(201).send({ id: nuevoUsuario.id, email: nuevoUsuario.email });
        } catch (error) {
            return handleDBError(reply, error);
        }
    });

    app.get('/', {
        schema: {
            description: 'Listar todos los usuarios (Solo Admin)',
            tags: ['Usuarios'],
            security: [{ bearerAuth: [] }],
            response: {
                200: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            id: { type: 'string', format: 'uuid' },
                            email: { type: 'string' },
                            nombre: { type: 'string' },
                            apellido: { type: 'string' },
                            activo: { type: 'boolean' }
                        }
                    }
                }
            }
        },
        preHandler: [app.authenticate, app.authorize('ADMIN')]
    }, async (request, reply) => {
        const users = await app.db.select({ id: usuarios.id, email: usuarios.email, nombre: usuarios.nombre, apellido: usuarios.apellido, activo: usuarios.activo }).from(usuarios);
        return users;
    });

    app.patch('/:id/roles', {
        schema: {
            description: 'Asignar un rol a un usuario (Solo Admin)',
            tags: ['Usuarios'],
            security: [{ bearerAuth: [] }],
            params: {
                type: 'object',
                properties: {
                    id: { type: 'string', format: 'uuid', description: 'ID del usuario' }
                }
            },
            body: {
                type: 'object',
                required: ['rolNombre'],
                properties: {
                    rolNombre: { type: 'string', description: 'Nombre del rol (ej: ADMIN, DOCENTE, ESTUDIANTE)' }
                }
            },
            response: {
                204: {
                    type: 'null',
                    description: 'Rol asignado exitosamente'
                },
                404: {
                    type: 'object',
                    properties: {
                        error: { type: 'string' }
                    }
                }
            }
        },
        preHandler: [app.authenticate, app.authorize('ADMIN')]
    }, async (request, reply) => {
        const { id } = request.params as any;
        const { rolNombre } = request.body as any;

        const rol = await app.db.query.roles.findFirst({ where: eq(roles.nombre, rolNombre) });
        if (!rol) return reply.status(404).send({ error: 'Rol no encontrado' });

        try {
            await app.db.insert(usuarioRoles).values({ usuarioId: id, rolId: rol.id });
            return reply.status(204).send();
        } catch (error) {
            return handleDBError(reply, error);
        }
    });

    app.patch('/:id/rol-estado', {
        schema: {
            description: 'Actualizar el estado contextual de un rol de usuario (Admin/Gestor)',
            tags: ['Usuarios'],
            security: [{ bearerAuth: [] }],
            params: {
                type: 'object',
                properties: {
                    id: { type: 'string', format: 'uuid', description: 'ID del usuario' }
                }
            },
            body: {
                type: 'object',
                required: ['rolNombre', 'nuevoEstado'],
                properties: {
                    rolNombre: { type: 'string', description: 'Nombre del rol (ej: ESTUDIANTE, DOCENTE)' },
                    nuevoEstado: { type: 'string', description: 'Nuevo estado para el rol (ej: Graduado, Inactivo, Activo)' }
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
                404: {
                    type: 'object',
                    properties: {
                        error: { type: 'string' }
                    }
                }
            }
        },
        preHandler: [app.authenticate, app.authorize('ADMIN', 'GESTOR')]
    }, async (request, reply) => {
        const { id } = request.params as any;
        const { rolNombre, nuevoEstado } = request.body as any;

        const rol = await app.db.query.roles.findFirst({ where: eq(roles.nombre, rolNombre) });
        if (!rol) return reply.status(404).send({ error: 'Rol no encontrado' });

        try {
            await app.db.update(usuarioRoles)
                .set({ estado: nuevoEstado })
                .where(and(eq(usuarioRoles.usuarioId, id), eq(usuarioRoles.rolId, rol.id)));

            return reply.status(200).send({ message: `Estado del rol ${rolNombre} actualizado a ${nuevoEstado}` });
        } catch (error) {
            return handleDBError(reply, error);
        }
    });

    // --- GET /:id (Obtener usuario por ID) ---
    app.get('/:id', {
        schema: {
            description: 'Obtener un usuario específico por ID (Solo Admin o Gestor)',
            tags: ['Usuarios'],
            security: [{ bearerAuth: [] }],
            params: {
                type: 'object',
                properties: {
                    id: { type: 'string', format: 'uuid', description: 'ID del usuario' }
                }
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid' },
                        email: { type: 'string' },
                        nombre: { type: 'string' },
                        apellido: { type: 'string' },
                        dni: { type: 'string' },
                        telefono: { type: 'string' },
                        domicilio: { type: 'string' },
                        fechaNacimiento: { type: 'string' },
                        activo: { type: 'boolean' },
                        requiereCambioClave: { type: 'boolean' },
                        roles: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    rol: {
                                        type: 'object',
                                        properties: {
                                            nombre: { type: 'string' }
                                        }
                                    },
                                    estado: { type: 'string' }
                                }
                            }
                        }
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
        preHandler: [app.authenticate, app.authorize('ADMIN', 'GESTOR')]
    }, async (request, reply) => {
        const { id } = request.params as any;
        const user = await app.db.query.usuarios.findFirst({
            where: eq(usuarios.id, id),
            with: { roles: { with: { rol: true } } }
        });
        if (!user) return reply.status(404).send({ error: 'Usuario no encontrado' });
        return user;
    });

    // --- PATCH /:id (Actualizar datos generales de usuario) ---
    app.patch('/:id', {
        schema: {
            description: 'Actualizar datos de perfil/demográficos de un usuario (Admin o Gestor)',
            tags: ['Usuarios'],
            security: [{ bearerAuth: [] }],
            params: {
                type: 'object',
                properties: {
                    id: { type: 'string', format: 'uuid', description: 'ID del usuario' }
                }
            },
            body: {
                type: 'object',
                properties: {
                    nombre: { type: 'string' },
                    apellido: { type: 'string' },
                    dni: { type: 'string' },
                    telefono: { type: 'string' },
                    domicilio: { type: 'string' },
                    fechaNacimiento: { type: 'string' },
                    activo: { type: 'boolean' }
                }
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid' },
                        email: { type: 'string' },
                        nombre: { type: 'string' },
                        apellido: { type: 'string' },
                        activo: { type: 'boolean' }
                    }
                },
                400: {
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
        },
        preHandler: [app.authenticate, app.authorize('ADMIN', 'GESTOR')]
    }, async (request, reply) => {
        const { id } = request.params as any;
        const body = request.body as any;

        const user = await app.db.query.usuarios.findFirst({ where: eq(usuarios.id, id) });
        if (!user) return reply.status(404).send({ error: 'Usuario no encontrado' });

        try {
            const [actualizado] = await app.db.update(usuarios)
                .set({
                    ...body,
                    updatedAt: new Date()
                })
                .where(eq(usuarios.id, id))
                .returning();

            // Sincronizar estado activo en Supabase si se provee
            if (body.activo !== undefined && user.authUserId) {
                await app.supabase.auth.admin.updateUserById(user.authUserId, {
                    ban: !body.activo // En Supabase, banear al usuario impide que inicie sesión
                });
            }

            return actualizado;
        } catch (error) {
            return handleDBError(reply, error);
        }
    });

    // --- DELETE /:id (Eliminar/Desactivar usuario) ---
    app.delete('/:id', {
        schema: {
            description: 'Dar de baja a un usuario del sistema (Solo Admin)',
            tags: ['Usuarios'],
            security: [{ bearerAuth: [] }],
            params: {
                type: 'object',
                properties: {
                    id: { type: 'string', format: 'uuid', description: 'ID del usuario' }
                }
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        message: { type: 'string' }
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
        preHandler: [app.authenticate, app.authorize('ADMIN')]
    }, async (request, reply) => {
        const { id } = request.params as any;
        const user = await app.db.query.usuarios.findFirst({ where: eq(usuarios.id, id) });
        if (!user) return reply.status(404).send({ error: 'Usuario no encontrado' });

        try {
            // Soft delete en DB local
            await app.db.update(usuarios)
                .set({ activo: false, updatedAt: new Date() })
                .where(eq(usuarios.id, id));

            // Soft delete (ban) en Supabase Auth
            if (user.authUserId) {
                await app.supabase.auth.admin.updateUserById(user.authUserId, {
                    ban: true
                });
            }

            return reply.status(200).send({ message: 'Usuario dado de baja (desactivado) correctamente' });
        } catch (error) {
            return handleDBError(reply, error);
        }
    });

    // PATCH /api/usuarios/:id/toggle-activo - Inhabilitar o Habilitar usuario
    app.patch('/:id/toggle-activo', {
        schema: {
            description: 'Inhabilitar o Habilitar usuario',
            tags: ['Usuarios'],
            security: [{ bearerAuth: [] }],
            params: {
                type: 'object',
                properties: {
                    id: { type: 'string', format: 'uuid', description: 'ID del usuario' }
                }
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        message: { type: 'string' }
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
        preHandler: [app.authenticate, app.authorize('ADMIN', 'GESTOR')]
    }, async (request, reply) => {
        const { id } = request.params as any;

        try {
            const user = await app.db.query.usuarios.findFirst({ where: eq(usuarios.id, id) });
            if (!user) return reply.status(404).send({ error: 'Usuario no encontrado' });

            const [updated] = await app.db.update(usuarios)
                .set({ activo: !user.activo })
                .where(eq(usuarios.id, id))
                .returning();

            return reply.status(200).send(updated);
        } catch (error) {
            return handleDBError(reply, error);
        }
    });

};