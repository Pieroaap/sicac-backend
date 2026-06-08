import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { cursosBase, cursosProgramados, estructuraEvaluacion, notasDetalle } from '../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { handleDBError } from '../utils/errors.js';
import { calculateFinalGrade } from '../services/grading.service.js';

export const cursosProgramadosRoutes: FastifyPluginAsync = async (app) => {

    // Instanciar curso (Snapshot)
    app.post('/', {
        schema: {
            description: 'Instanciar un curso programado (Solo Admin)',
            tags: ['Cursos Programados'],
            security: [{ bearerAuth: [] }],
            body: {
                type: 'object',
                required: ['cursoBaseId', 'cicloAcademicoId', 'cupoTotal'],
                properties: {
                    cursoBaseId: { type: 'string', format: 'uuid' },
                    cicloAcademicoId: { type: 'string', format: 'uuid' },
                    profesorId: { type: 'string', format: 'uuid' },
                    cupoTotal: { type: 'integer', minimum: 1 },
                    horario: { type: 'string' },
                    aula: { type: 'string' }
                }
            },
            response: {
                201: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid' },
                        cursoBaseId: { type: 'string', format: 'uuid' },
                        cicloAcademicoId: { type: 'string', format: 'uuid' },
                        profesorId: { type: 'string', format: 'uuid' },
                        nombreSnapshot: { type: 'string' },
                        creditosSnapshot: { type: 'integer' },
                        cupoTotal: { type: 'integer' },
                        cuposDisponibles: { type: 'integer' },
                        horario: { type: 'string' },
                        aula: { type: 'string' },
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
        preHandler: [app.authenticate, app.authorize('ADMIN')]
    }, async (req, reply) => {
        const { cursoBaseId, cicloAcademicoId, profesorId, cupoTotal, horario } = req.body as any;

        const cursoBaseData = await app.db.query.cursosBase.findFirst({ where: eq(cursosBase.id, cursoBaseId) });
        if (!cursoBaseData) return reply.status(404).send({ error: 'Curso base no existe' });

        try {
            const [instancia] = await app.db.insert(cursosProgramados).values({
                cursoBaseId, cicloAcademicoId, profesorId, cupoTotal, cuposDisponibles: cupoTotal, horario,
                nombreSnapshot: cursoBaseData.nombre,
                creditosSnapshot: cursoBaseData.creditos
            }).returning();
            return reply.status(201).send(instancia);
        } catch (error) { return handleDBError(reply, error); }
    });

    // Crear Estructura de Evaluación
    app.post('/:id/estructura', {
        schema: {
            description: 'Crear estructura de evaluación del curso (Solo Docente)',
            tags: ['Cursos Programados'],
            security: [{ bearerAuth: [] }],
            params: {
                type: 'object',
                properties: {
                    id: { type: 'string', format: 'uuid', description: 'ID del curso programado' }
                }
            },
            body: {
                type: 'array',
                items: {
                    type: 'object',
                    required: ['nombreEvaluacion', 'pesoPorcentual'],
                    properties: {
                        nombreEvaluacion: { type: 'string' },
                        pesoPorcentual: { type: 'number', minimum: 0, maximum: 100 }
                    }
                }
            },
            response: {
                201: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            id: { type: 'string', format: 'uuid' },
                            cursoProgramadoId: { type: 'string', format: 'uuid' },
                            nombreEvaluacion: { type: 'string' },
                            pesoPorcentual: { type: 'string' }
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
        },
        preHandler: [app.authenticate, app.authorize('DOCENTE')]
    }, async (req, reply) => {
        const { id } = req.params as any;
        const items = req.body as any[]; // Array de { nombreEvaluacion, pesoPorcentual }

        try {
            const values = items.map(i => ({ ...i, cursoProgramadoId: id }));
            const result = await app.db.insert(estructuraEvaluacion).values(values).returning();
            return reply.status(201).send(result);
        } catch (error) { return handleDBError(reply, error); }
    });

    // ======================================================================
    // EL ENDPOINT BULK FANTASMA: Ingreso de Notas Masivo (Grilla Excel)
    // ======================================================================
    app.post('/:id/notas-bulk', {
        schema: {
            description: 'Ingresar notas detalladas de estudiantes en bulk (Solo Docente)',
            tags: ['Cursos Programados'],
            security: [{ bearerAuth: [] }],
            params: {
                type: 'object',
                properties: {
                    id: { type: 'string', format: 'uuid', description: 'ID del curso programado' }
                }
            },
            body: {
                type: 'object',
                required: ['notas'],
                properties: {
                    notas: {
                        type: 'array',
                        items: {
                            type: 'object',
                            required: ['estudianteId', 'estructuraEvaluacionId', 'notaCruda'],
                            properties: {
                                estudianteId: { type: 'string', format: 'uuid' },
                                estructuraEvaluacionId: { type: 'string', format: 'uuid' },
                                notaCruda: { type: 'number', minimum: 0, maximum: 20 }
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
    }, async (req, reply) => {
        const { id } = req.params as any;
        const { notas } = req.body as any;

        try {
            const result = await app.db.insert(notasDetalle)
                .values(notas.map((n: any) => ({ ...n })))
                .onConflictDoUpdate({
                    target: [notasDetalle.estudianteId, notasDetalle.estructuraEvaluacionId],
                    set: { notaCruda: sql`EXCLUDED.nota_cruda` }
                })
                .returning();

            return reply.status(200).send({ message: `${result.length} notas procesadas correctamente` });
        } catch (error) {
            return handleDBError(reply, error);
        }
    });

    // Cerrar Notas (Calcular Final)
    app.post('/:id/cerrar-notas', {
        schema: {
            description: 'Cerrar el acta de notas y calcular promedios finales (Solo Docente)',
            tags: ['Cursos Programados'],
            security: [{ bearerAuth: [] }],
            params: {
                type: 'object',
                properties: {
                    id: { type: 'string', format: 'uuid', description: 'ID del curso programado' }
                }
            },
            body: {
                type: 'object',
                required: ['estudiantesIds'],
                properties: {
                    estudiantesIds: {
                        type: 'array',
                        items: { type: 'string', format: 'uuid' }
                    }
                }
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        message: { type: 'string' },
                        resultados: {
                            type: 'array',
                            items: { type: 'number' }
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
        },
        preHandler: [app.authenticate, app.authorize('DOCENTE')]
    }, async (req, reply) => {
        const { id } = req.params as any;
        const { estudiantesIds } = req.body as any;

        try {
            const results = [];
            for (const estId of estudiantesIds) {
                results.push(await calculateFinalGrade(estId, id));
            }
            return reply.status(200).send({ message: 'Notas cerradas', resultados: results });
        } catch (error: any) {
            return reply.status(400).send({ error: error.message });
        }
    });

    // --- GET / (Listar todos los cursos programados) ---
    app.get('/', {
        schema: {
            description: 'Obtener todos los cursos programados',
            tags: ['Cursos Programados'],
            security: [{ bearerAuth: [] }]
        },
        preHandler: [app.authenticate]
    }, async (req, reply) => {
        return app.db.query.cursosProgramados.findMany({
            with: { cursoBase: true, profesor: true, cicloAcademico: true }
        });
    });

    // --- GET /:id (Obtener curso programado por ID) ---
    app.get('/:id', {
        schema: {
            description: 'Obtener un curso programado por ID',
            tags: ['Cursos Programados'],
            security: [{ bearerAuth: [] }],
            params: {
                type: 'object',
                properties: {
                    id: { type: 'string', format: 'uuid', description: 'ID del curso programado' }
                }
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid' },
                        cursoBaseId: { type: 'string', format: 'uuid' },
                        cicloAcademicoId: { type: 'string', format: 'uuid' },
                        profesorId: { type: 'string', format: 'uuid', nullable: true },
                        nombreSnapshot: { type: 'string' },
                        creditosSnapshot: { type: 'integer' },
                        cupoTotal: { type: 'integer' },
                        cuposDisponibles: { type: 'integer' },
                        horario: { type: 'string', nullable: true },
                        aula: { type: 'string', nullable: true },
                        estado: { type: 'string' },
                        cursoBase: {
                            type: 'object',
                            properties: {
                                codigo: { type: 'string' },
                                nombre: { type: 'string' }
                            }
                        },
                        profesor: {
                            type: 'object',
                            nullable: true,
                            properties: {
                                nombre: { type: 'string' },
                                apellido: { type: 'string' }
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
        const curso = await app.db.query.cursosProgramados.findFirst({
            where: eq(cursosProgramados.id, id),
            with: { cursoBase: true, profesor: true }
        });
        if (!curso) return reply.status(404).send({ error: 'Curso programado no encontrado' });
        return curso;
    });

    // --- PATCH /:id (Actualizar curso programado) ---
    app.patch('/:id', {
        schema: {
            description: 'Actualizar un curso programado (Solo Admin)',
            tags: ['Cursos Programados'],
            security: [{ bearerAuth: [] }],
            params: {
                type: 'object',
                properties: {
                    id: { type: 'string', format: 'uuid', description: 'ID del curso programado' }
                }
            },
            body: {
                type: 'object',
                properties: {
                    profesorId: { type: 'string', format: 'uuid' },
                    cupoTotal: { type: 'integer', minimum: 1 },
                    horario: { type: 'string' },
                    aula: { type: 'string' },
                    estado: { type: 'string' }
                }
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid' },
                        profesorId: { type: 'string', format: 'uuid', nullable: true },
                        cupoTotal: { type: 'integer' },
                        cuposDisponibles: { type: 'integer' },
                        horario: { type: 'string', nullable: true },
                        aula: { type: 'string', nullable: true },
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
        preHandler: [app.authenticate, app.authorize('ADMIN')]
    }, async (req, reply) => {
        const { id } = req.params as any;
        const body = req.body as any;

        const curso = await app.db.query.cursosProgramados.findFirst({ where: eq(cursosProgramados.id, id) });
        if (!curso) return reply.status(404).send({ error: 'Curso programado no encontrado' });

        try {
            // Si el cupo total cambia, ajustar cupos disponibles
            let cuposDisponibles = curso.cuposDisponibles;
            if (body.cupoTotal !== undefined) {
                const diff = body.cupoTotal - curso.cupoTotal;
                cuposDisponibles = curso.cuposDisponibles + diff;
                if (cuposDisponibles < 0) {
                    return reply.status(400).send({ error: 'El nuevo cupo total no puede ser menor que las matrículas ya registradas.' });
                }
            }

            const [actualizado] = await app.db.update(cursosProgramados)
                .set({
                    ...body,
                    cuposDisponibles,
                    updatedAt: new Date()
                })
                .where(eq(cursosProgramados.id, id))
                .returning();

            return actualizado;
        } catch (error) { return handleDBError(reply, error); }
    });

    // --- DELETE /:id (Eliminar curso programado) ---
    app.delete('/:id', {
        schema: {
            description: 'Eliminar un curso programado (Solo Admin)',
            tags: ['Cursos Programados'],
            security: [{ bearerAuth: [] }],
            params: {
                type: 'object',
                properties: {
                    id: { type: 'string', format: 'uuid', description: 'ID del curso programado' }
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
        preHandler: [app.authenticate, app.authorize('ADMIN')]
    }, async (req, reply) => {
        const { id } = req.params as any;

        const curso = await app.db.query.cursosProgramados.findFirst({ where: eq(cursosProgramados.id, id) });
        if (!curso) return reply.status(404).send({ error: 'Curso programado no encontrado' });

        try {
            await app.db.delete(cursosProgramados).where(eq(cursosProgramados.id, id));
            return { message: 'Curso programado eliminado correctamente' };
        } catch (error) { return handleDBError(reply, error); }
    });
};