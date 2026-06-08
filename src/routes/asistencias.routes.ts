import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { asistencias } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { handleDBError } from '../utils/errors.js';

export const asistenciasRoutes: FastifyPluginAsync = async (app) => {

    // --- CREATE/UPDATE BULK (Registrar o actualizar asistencia de estudiantes en bulk) ---
    app.post('/bulk', {
        schema: {
            description: 'Registrar o actualizar asistencia de estudiantes en bulk (Solo Docente)',
            tags: ['Asistencias'],
            security: [{ bearerAuth: [] }],
            body: {
                type: 'object',
                required: ['asistencias'],
                properties: {
                    asistencias: {
                        type: 'array',
                        items: {
                            type: 'object',
                            required: ['cursoProgramadoId', 'estudianteId', 'fechaSesion', 'estado'],
                            properties: {
                                cursoProgramadoId: { type: 'string', format: 'uuid' },
                                estudianteId: { type: 'string', format: 'uuid' },
                                fechaSesion: { type: 'string', format: 'date', description: 'Fecha de la sesión (YYYY-MM-DD)' },
                                estado: { type: 'string', description: 'Estado de asistencia (ej: Presente, Ausente, Tardanza)' }
                            }
                        }
                    }
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
                }
            }
        },
        preHandler: [app.authenticate, app.authorize('DOCENTE')]
    }, async (request, reply) => {
        const { asistencias: listaAsistencias } = request.body as any;

        try {
            const result = await app.db.insert(asistencias)
                .values(listaAsistencias)
                .onConflictDoUpdate({
                    target: [asistencias.cursoProgramadoId, asistencias.estudianteId, asistencias.fechaSesion],
                    set: { estado: sql`EXCLUDED.estado` }
                })
                .returning();

            return reply.status(200).send({ message: `${result.length} asistencias registradas/actualizadas` });
        } catch (error) {
            return handleDBError(reply, error);
        }
    });

    // --- READ ALL (Listar y filtrar asistencias) ---
    app.get('/', {
        schema: {
            description: 'Listar y filtrar registros de asistencia (Solo Docente)',
            tags: ['Asistencias'],
            security: [{ bearerAuth: [] }],
            querystring: {
                type: 'object',
                properties: {
                    cursoProgramadoId: { type: 'string', format: 'uuid' },
                    estudianteId: { type: 'string', format: 'uuid' },
                    fechaSesion: { type: 'string', format: 'date' }
                }
            }
        },
        preHandler: [app.authenticate, app.authorize('DOCENTE')]
    }, async (request, reply) => {
        const query = request.query as any;
        const conditions = [];

        if (query.cursoProgramadoId) {
            conditions.push(eq(asistencias.cursoProgramadoId, query.cursoProgramadoId));
        }
        if (query.estudianteId) {
            conditions.push(eq(asistencias.estudianteId, query.estudianteId));
        }
        if (query.fechaSesion) {
            conditions.push(eq(asistencias.fechaSesion, query.fechaSesion));
        }

        return app.db.query.asistencias.findMany({
            where: conditions.length > 0 ? and(...conditions) : undefined,
            with: { estudiante: true, cursoProgramado: true }
        });
    });

    // --- READ SINGLE (Obtener una asistencia por ID) ---
    app.get('/:id', {
        schema: {
            description: 'Obtener un registro de asistencia por ID (Solo Docente)',
            tags: ['Asistencias'],
            security: [{ bearerAuth: [] }],
            params: {
                type: 'object',
                properties: {
                    id: { type: 'string', format: 'uuid', description: 'ID de la asistencia' }
                }
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid' },
                        cursoProgramadoId: { type: 'string', format: 'uuid' },
                        estudianteId: { type: 'string', format: 'uuid' },
                        fechaSesion: { type: 'string' },
                        estado: { type: 'string' },
                        createdAt: { type: 'string' }
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
        preHandler: [app.authenticate, app.authorize('DOCENTE')]
    }, async (request, reply) => {
        const { id } = request.params as any;
        const record = await app.db.query.asistencias.findFirst({ where: eq(asistencias.id, id) });
        if (!record) return reply.status(404).send({ error: 'Asistencia no encontrada' });
        return record;
    });

    // --- UPDATE SINGLE (Actualizar estado de una asistencia individual) ---
    app.patch('/:id', {
        schema: {
            description: 'Actualizar el estado de un registro de asistencia individual (Solo Docente)',
            tags: ['Asistencias'],
            security: [{ bearerAuth: [] }],
            params: {
                type: 'object',
                properties: {
                    id: { type: 'string', format: 'uuid', description: 'ID de la asistencia' }
                }
            },
            body: {
                type: 'object',
                required: ['estado'],
                properties: {
                    estado: { type: 'string', description: 'Nuevo estado (ej: Presente, Ausente, Tardanza)' }
                }
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid' },
                        estado: { type: 'string' }
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
        preHandler: [app.authenticate, app.authorize('DOCENTE')]
    }, async (request, reply) => {
        const { id } = request.params as any;
        const { estado } = request.body as any;

        const record = await app.db.query.asistencias.findFirst({ where: eq(asistencias.id, id) });
        if (!record) return reply.status(404).send({ error: 'Asistencia no encontrada' });

        try {
            const [actualizado] = await app.db.update(asistencias)
                .set({ estado })
                .where(eq(asistencias.id, id))
                .returning();
            return actualizado;
        } catch (error) { return handleDBError(reply, error); }
    });

    // --- DELETE SINGLE (Eliminar registro de asistencia individual) ---
    app.delete('/:id', {
        schema: {
            description: 'Eliminar un registro de asistencia individual (Solo Docente)',
            tags: ['Asistencias'],
            security: [{ bearerAuth: [] }],
            params: {
                type: 'object',
                properties: {
                    id: { type: 'string', format: 'uuid', description: 'ID de la asistencia' }
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
        preHandler: [app.authenticate, app.authorize('DOCENTE')]
    }, async (request, reply) => {
        const { id } = request.params as any;

        const record = await app.db.query.asistencias.findFirst({ where: eq(asistencias.id, id) });
        if (!record) return reply.status(404).send({ error: 'Asistencia no encontrada' });

        try {
            await app.db.delete(asistencias).where(eq(asistencias.id, id));
            return { message: 'Asistencia eliminada correctamente' };
        } catch (error) { return handleDBError(reply, error); }
    });
};