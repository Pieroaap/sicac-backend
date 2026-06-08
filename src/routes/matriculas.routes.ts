import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { matriculas, detalleMatriculas, cursosProgramados } from '../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import { enrollCourse } from '../services/enrollment.service.js';
import { handleDBError } from '../utils/errors.js';

export const matriculasRoutes: FastifyPluginAsync = async (app) => {
    // --- CREATE (Crear cabecera de matrícula) ---
    app.post('/', {
        schema: {
            description: 'Crear cabecera de matrícula para un estudiante (Solo Estudiante o Admin)',
            tags: ['Matrículas'],
            security: [{ bearerAuth: [] }],
            body: {
                type: 'object',
                required: ['cicloAcademicoId'],
                properties: {
                    cicloAcademicoId: { type: 'string', format: 'uuid' }
                }
            }
        },
        preHandler: [app.authenticate, app.authorize('ESTUDIANTE', 'ADMIN')]
    }, async (req, reply) => {
        const { cicloAcademicoId } = req.body as any;
        const estudianteId = (req.user as any).id;
        try {
            const [mat] = await app.db.insert(matriculas).values({ estudianteId, cicloAcademicoId }).returning();
            return reply.status(201).send(mat);
        } catch (error) { return handleDBError(reply, error); }
    });

    // --- READ ALL (Listar todas las matrículas) ---
    app.get('/', {
        schema: {
            description: 'Obtener todas las matrículas registradas (Solo Admin o Gestor)',
            tags: ['Matrículas'],
            security: [{ bearerAuth: [] }]
        },
        preHandler: [app.authenticate, app.authorize('ADMIN', 'GESTOR')]
    }, async (req, reply) => {
        return app.db.query.matriculas.findMany({
            with: { estudiante: true, cicloAcademico: true, detalles: { with: { cursoProgramado: true } } }
        });
    });

    // --- READ SINGLE (Obtener matrícula por ID con detalles) ---
    app.get('/:id', {
        schema: {
            description: 'Obtener una matrícula específica por ID con sus detalles de cursos',
            tags: ['Matrículas'],
            security: [{ bearerAuth: [] }],
            params: {
                type: 'object',
                properties: {
                    id: { type: 'string', format: 'uuid', description: 'ID de la matrícula' }
                }
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid' },
                        estudianteId: { type: 'string', format: 'uuid' },
                        cicloAcademicoId: { type: 'string', format: 'uuid' },
                        estado: { type: 'string' },
                        createdAt: { type: 'string' },
                        estudiante: {
                            type: 'object',
                            properties: {
                                nombre: { type: 'string' },
                                apellido: { type: 'string' },
                                email: { type: 'string' }
                            }
                        },
                        cicloAcademico: {
                            type: 'object',
                            properties: {
                                nombre: { type: 'string' }
                            }
                        },
                        detalles: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    id: { type: 'string', format: 'uuid' },
                                    cursoProgramadoId: { type: 'string', format: 'uuid' },
                                    estado: { type: 'string' },
                                    cursoProgramado: {
                                        type: 'object',
                                        properties: {
                                            nombreSnapshot: { type: 'string' },
                                            horario: { type: 'string', nullable: true },
                                            aula: { type: 'string', nullable: true }
                                        }
                                    }
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
        preHandler: [app.authenticate]
    }, async (req, reply) => {
        const { id } = req.params as any;
        const mat = await app.db.query.matriculas.findFirst({
            where: eq(matriculas.id, id),
            with: { estudiante: true, cicloAcademico: true, detalles: { with: { cursoProgramado: true } } }
        });
        if (!mat) return reply.status(404).send({ error: 'Matrícula no encontrada' });
        return mat;
    });

    // --- UPDATE (Actualizar estado de matrícula) ---
    app.patch('/:id', {
        schema: {
            description: 'Actualizar el estado de una matrícula (Solo Admin o Gestor)',
            tags: ['Matrículas'],
            security: [{ bearerAuth: [] }],
            params: {
                type: 'object',
                properties: {
                    id: { type: 'string', format: 'uuid', description: 'ID de la matrícula' }
                }
            },
            body: {
                type: 'object',
                required: ['estado'],
                properties: {
                    estado: { type: 'string', description: 'Nuevo estado (ej: Confirmada, Pendiente, Cancelada)' }
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
        preHandler: [app.authenticate, app.authorize('ADMIN', 'GESTOR')]
    }, async (req, reply) => {
        const { id } = req.params as any;
        const { estado } = req.body as any;

        const mat = await app.db.query.matriculas.findFirst({ where: eq(matriculas.id, id) });
        if (!mat) return reply.status(404).send({ error: 'Matrícula no encontrada' });

        try {
            const [actualizado] = await app.db.update(matriculas)
                .set({ estado })
                .where(eq(matriculas.id, id))
                .returning();
            return actualizado;
        } catch (error) { return handleDBError(reply, error); }
    });

    // --- DELETE (Eliminar matrícula completa y liberar cupos) ---
    app.delete('/:id', {
        schema: {
            description: 'Eliminar una matrícula completa (Devuelve cupos y borra detalles) (Solo Admin o Gestor)',
            tags: ['Matrículas'],
            security: [{ bearerAuth: [] }],
            params: {
                type: 'object',
                properties: {
                    id: { type: 'string', format: 'uuid', description: 'ID de la matrícula' }
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
    }, async (req, reply) => {
        const { id } = req.params as any;
        try {
            const mat = await app.db.query.matriculas.findFirst({
                where: eq(matriculas.id, id),
                with: { detalles: true }
            });
            if (!mat) return reply.status(404).send({ error: 'Matrícula no encontrada' });

            await app.db.transaction(async (tx) => {
                // Devolver cupos de todos los cursos inscritos
                for (const det of mat.detalles) {
                    await tx.update(cursosProgramados)
                        .set({ cuposDisponibles: sql`${cursosProgramados.cuposDisponibles} + 1` })
                        .where(eq(cursosProgramados.id, det.cursoProgramadoId));
                }
                // Borrar cabecera (cascada borrará detalles)
                await tx.delete(matriculas).where(eq(matriculas.id, id));
            });

            return { message: 'Matrícula eliminada y cupos devueltos correctamente' };
        } catch (error) { return handleDBError(reply, error); }
    });

    // --- ADD COURSE DETAIL (Inscribir detalle con concurrencia de cupos) ---
    app.post('/:matriculaId/detalle', {
        schema: {
            description: 'Agregar curso a la matrícula del estudiante (Control de cupos)',
            tags: ['Matrículas'],
            security: [{ bearerAuth: [] }],
            params: {
                type: 'object',
                properties: {
                    matriculaId: { type: 'string', format: 'uuid', description: 'ID de la matrícula' }
                }
            },
            body: {
                type: 'object',
                required: ['cursoProgramadoId'],
                properties: {
                    cursoProgramadoId: { type: 'string', format: 'uuid' }
                }
            }
        },
        preHandler: [app.authenticate, app.authorize('ESTUDIANTE', 'ADMIN')]
    }, async (req, reply) => {
        const { matriculaId } = req.params as any;
        const { cursoProgramadoId } = req.body as any;
        const estudianteId = (req.user as any).id;

        try {
            // Obtener el ciclo de la matrícula para el servicio
            const mat = await app.db.query.matriculas.findFirst({ where: eq(matriculas.id, matriculaId) });
            if (!mat) return reply.status(404).send({ error: 'Matrícula no existe' });

            const result = await enrollCourse(estudianteId, cursoProgramadoId, mat.cicloAcademicoId);
            return reply.status(201).send(result);
        } catch (error: any) {
            if (error.message.includes('cupos')) return reply.status(409).send({ error: error.message });
            return handleDBError(reply, error);
        }
    });

    // --- DELETE COURSE DETAIL (Retirarse de un curso y devolver cupo) ---
    app.delete('/:matriculaId/detalle/:detalleId', {
        schema: {
            description: 'Retirar curso programado de la matrícula (Devuelve el cupo al curso)',
            tags: ['Matrículas'],
            security: [{ bearerAuth: [] }],
            params: {
                type: 'object',
                properties: {
                    matriculaId: { type: 'string', format: 'uuid', description: 'ID de la matrícula' },
                    detalleId: { type: 'string', format: 'uuid', description: 'ID del detalle de la matrícula' }
                }
            }
        },
        preHandler: [app.authenticate]
    }, async (req, reply) => {
        const { matriculaId, detalleId } = req.params as any;

        try {
            const detalle = await app.db.query.detalleMatriculas.findFirst({ where: eq(detalleMatriculas.id, detalleId) });
            if (!detalle) return reply.status(404).send({ error: 'Detalle no encontrado' });

            // Transacción: Borrar detalle + Devolver cupo
            await app.db.transaction(async (tx) => {
                await tx.delete(detalleMatriculas).where(eq(detalleMatriculas.id, detalleId));
                await tx.update(cursosProgramados)
                    .set({ cuposDisponibles: sql`${cursosProgramados.cuposDisponibles} + 1` })
                    .where(eq(cursosProgramados.id, detalle.cursoProgramadoId));
            });

            return reply.status(204).send();
        } catch (error) { return handleDBError(reply, error); }
    });
};