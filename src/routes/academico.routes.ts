import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { carreras, cursosBase, mallaCurricular, ciclosAcademicos, cursosProgramados } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { handleDBError } from '../utils/errors.js';

export const academicoRoutes: FastifyPluginAsync = async (app) => {

    // ==========================================
    // --- CARRERAS ---
    // ==========================================

    // CREATE
    app.post('/carreras', {
        schema: {
            description: 'Crear una nueva carrera (Solo Admin)',
            tags: ['Académico - Carreras'],
            security: [{ bearerAuth: [] }],
            body: {
                type: 'object',
                required: ['codigo', 'nombre'],
                properties: {
                    codigo: { type: 'string' },
                    nombre: { type: 'string' },
                    totalCiclos: { type: 'integer', default: 4 }
                }
            },
            response: {
                201: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid' },
                        codigo: { type: 'string' },
                        nombre: { type: 'string' },
                        totalCiclos: { type: 'integer' }
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
        preHandler: [app.authenticate, app.authorize('ADMIN')]
    }, async (req, reply) => {
        const body = req.body as any;
        try {
            const [nuevo] = await app.db.insert(carreras).values(body).returning();
            return reply.status(201).send(nuevo);
        } catch (error) { return handleDBError(reply, error); }
    });

    // READ ALL
    app.get('/carreras', {
        schema: {
            description: 'Obtener todas las carreras',
            tags: ['Académico - Carreras'],
            security: [{ bearerAuth: [] }]
        },
        preHandler: [app.authenticate]
    }, async (req, reply) => {
        return app.db.select().from(carreras);
    });

    // READ SINGLE
    app.get('/carreras/:id', {
        schema: {
            description: 'Obtener una carrera específica por ID',
            tags: ['Académico - Carreras'],
            security: [{ bearerAuth: [] }],
            params: {
                type: 'object',
                properties: {
                    id: { type: 'string', format: 'uuid', description: 'ID de la carrera' }
                }
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid' },
                        codigo: { type: 'string' },
                        nombre: { type: 'string' },
                        totalCiclos: { type: 'integer' }
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
        const carrera = await app.db.query.carreras.findFirst({ where: eq(carreras.id, id) });
        if (!carrera) return reply.status(404).send({ error: 'Carrera no encontrada' });
        return carrera;
    });

    // UPDATE
    app.patch('/carreras/:id', {
        schema: {
            description: 'Actualizar una carrera (Solo Admin)',
            tags: ['Académico - Carreras'],
            security: [{ bearerAuth: [] }],
            params: {
                type: 'object',
                properties: {
                    id: { type: 'string', format: 'uuid', description: 'ID de la carrera' }
                }
            },
            body: {
                type: 'object',
                properties: {
                    codigo: { type: 'string' },
                    nombre: { type: 'string' },
                    totalCiclos: { type: 'integer' }
                }
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid' },
                        codigo: { type: 'string' },
                        nombre: { type: 'string' },
                        totalCiclos: { type: 'integer' }
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

        const carrera = await app.db.query.carreras.findFirst({ where: eq(carreras.id, id) });
        if (!carrera) return reply.status(404).send({ error: 'Carrera no encontrada' });

        try {
            const [actualizado] = await app.db.update(carreras).set(body).where(eq(carreras.id, id)).returning();
            return actualizado;
        } catch (error) { return handleDBError(reply, error); }
    });

    // DELETE
    app.delete('/carreras/:id', {
        schema: {
            description: 'Eliminar una carrera (Solo Admin)',
            tags: ['Académico - Carreras'],
            security: [{ bearerAuth: [] }],
            params: {
                type: 'object',
                properties: {
                    id: { type: 'string', format: 'uuid', description: 'ID de la carrera' }
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
        const carrera = await app.db.query.carreras.findFirst({ where: eq(carreras.id, id) });
        if (!carrera) return reply.status(404).send({ error: 'Carrera no encontrada' });

        try {
            await app.db.delete(carreras).where(eq(carreras.id, id));
            return { message: 'Carrera eliminada correctamente' };
        } catch (error) { return handleDBError(reply, error); }
    });

    // READ MALLA
    app.get('/carreras/:id/malla', {
        schema: {
            description: 'Obtener la malla curricular de una carrera',
            tags: ['Académico - Carreras'],
            security: [{ bearerAuth: [] }],
            params: {
                type: 'object',
                properties: {
                    id: { type: 'string', format: 'uuid', description: 'ID de la carrera' }
                }
            }
        },
        preHandler: [app.authenticate]
    }, async (req, reply) => {
        const { id } = req.params as any;
        return app.db.query.mallaCurricular.findMany({
            where: eq(mallaCurricular.carreraId, id),
            with: { cursoBase: true }
        });
    });

    // ==========================================
    // --- CURSOS BASE ---
    // ==========================================

    // CREATE
    app.post('/cursos-base', {
        schema: {
            description: 'Crear un nuevo curso base (Solo Admin)',
            tags: ['Académico - Cursos Base'],
            security: [{ bearerAuth: [] }],
            body: {
                type: 'object',
                required: ['codigo', 'nombre'],
                properties: {
                    codigo: { type: 'string' },
                    nombre: { type: 'string' },
                    creditos: { type: 'integer', default: 0 },
                    horas: { type: 'integer', default: 0 }
                }
            },
            response: {
                201: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid' },
                        codigo: { type: 'string' },
                        nombre: { type: 'string' },
                        creditos: { type: 'integer' },
                        horas: { type: 'integer' }
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
        preHandler: [app.authenticate, app.authorize('ADMIN')]
    }, async (req, reply) => {
        const body = req.body as any;
        try {
            const [nuevo] = await app.db.insert(cursosBase).values(body).returning();
            return reply.status(201).send(nuevo);
        } catch (error) { return handleDBError(reply, error); }
    });

    // READ ALL
    app.get('/cursos-base', {
        schema: {
            description: 'Obtener todos los cursos base',
            tags: ['Académico - Cursos Base'],
            security: [{ bearerAuth: [] }]
        },
        preHandler: [app.authenticate]
    }, async (req, reply) => {
        return app.db.select().from(cursosBase);
    });

    // READ SINGLE
    app.get('/cursos-base/:id', {
        schema: {
            description: 'Obtener un curso base por ID',
            tags: ['Académico - Cursos Base'],
            security: [{ bearerAuth: [] }],
            params: {
                type: 'object',
                properties: {
                    id: { type: 'string', format: 'uuid', description: 'ID del curso base' }
                }
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid' },
                        codigo: { type: 'string' },
                        nombre: { type: 'string' },
                        creditos: { type: 'integer' },
                        horas: { type: 'integer' }
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
        const curso = await app.db.query.cursosBase.findFirst({ where: eq(cursosBase.id, id) });
        if (!curso) return reply.status(404).send({ error: 'Curso base no encontrado' });
        return curso;
    });

    // UPDATE
    app.patch('/cursos-base/:id', {
        schema: {
            description: 'Actualizar un curso base (Solo Admin)',
            tags: ['Académico - Cursos Base'],
            security: [{ bearerAuth: [] }],
            params: {
                type: 'object',
                properties: {
                    id: { type: 'string', format: 'uuid', description: 'ID del curso base' }
                }
            },
            body: {
                type: 'object',
                properties: {
                    codigo: { type: 'string' },
                    nombre: { type: 'string' },
                    creditos: { type: 'integer' },
                    horas: { type: 'integer' }
                }
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid' },
                        codigo: { type: 'string' },
                        nombre: { type: 'string' },
                        creditos: { type: 'integer' },
                        horas: { type: 'integer' }
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

        const curso = await app.db.query.cursosBase.findFirst({ where: eq(cursosBase.id, id) });
        if (!curso) return reply.status(404).send({ error: 'Curso base no encontrado' });

        try {
            const [actualizado] = await app.db.update(cursosBase).set(body).where(eq(cursosBase.id, id)).returning();
            return actualizado;
        } catch (error) { return handleDBError(reply, error); }
    });

    // DELETE
    app.delete('/cursos-base/:id', {
        schema: {
            description: 'Eliminar un curso base (Solo Admin)',
            tags: ['Académico - Cursos Base'],
            security: [{ bearerAuth: [] }],
            params: {
                type: 'object',
                properties: {
                    id: { type: 'string', format: 'uuid', description: 'ID del curso base' }
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
        const curso = await app.db.query.cursosBase.findFirst({ where: eq(cursosBase.id, id) });
        if (!curso) return reply.status(404).send({ error: 'Curso base no encontrado' });

        try {
            await app.db.delete(cursosBase).where(eq(cursosBase.id, id));
            return { message: 'Curso base eliminado correctamente' };
        } catch (error) { return handleDBError(reply, error); }
    });


    // ==========================================
    // --- CICLOS ---
    // ==========================================

    // CREATE
    app.post('/ciclos', {
        schema: {
            description: 'Crear un nuevo ciclo académico (Solo Admin)',
            tags: ['Académico - Ciclos'],
            security: [{ bearerAuth: [] }],
            body: {
                type: 'object',
                required: ['nombre', 'fechaInicio', 'fechaFin'],
                properties: {
                    nombre: { type: 'string', description: 'Nombre del ciclo (ej: 2026-I)' },
                    fechaInicio: { type: 'string', format: 'date' },
                    fechaFin: { type: 'string', format: 'date' },
                    estado: { type: 'string', default: 'Planificado' }
                }
            },
            response: {
                201: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid' },
                        nombre: { type: 'string' },
                        fechaInicio: { type: 'string' },
                        fechaFin: { type: 'string' },
                        estado: { type: 'string' }
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
        preHandler: [app.authenticate, app.authorize('ADMIN')]
    }, async (req, reply) => {
        const body = req.body as any;
        try {
            const [nuevo] = await app.db.insert(ciclosAcademicos).values(body).returning();
            return reply.status(201).send(nuevo);
        } catch (error) { return handleDBError(reply, error); }
    });

    // READ ALL
    app.get('/ciclos', {
        schema: {
            description: 'Obtener todos los ciclos académicos',
            tags: ['Académico - Ciclos'],
            security: [{ bearerAuth: [] }]
        },
        preHandler: [app.authenticate]
    }, async (req, reply) => {
        return app.db.select().from(ciclosAcademicos);
    });

    // READ SINGLE
    app.get('/ciclos/:id', {
        schema: {
            description: 'Obtener un ciclo académico por ID',
            tags: ['Académico - Ciclos'],
            security: [{ bearerAuth: [] }],
            params: {
                type: 'object',
                properties: {
                    id: { type: 'string', format: 'uuid', description: 'ID del ciclo académico' }
                }
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid' },
                        nombre: { type: 'string' },
                        fechaInicio: { type: 'string' },
                        fechaFin: { type: 'string' },
                        estado: { type: 'string' }
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
        const ciclo = await app.db.query.ciclosAcademicos.findFirst({ where: eq(ciclosAcademicos.id, id) });
        if (!ciclo) return reply.status(404).send({ error: 'Ciclo académico no encontrado' });
        return ciclo;
    });

    // UPDATE
    app.patch('/ciclos/:id', {
        schema: {
            description: 'Actualizar un ciclo académico (Solo Admin)',
            tags: ['Académico - Ciclos'],
            security: [{ bearerAuth: [] }],
            params: {
                type: 'object',
                properties: {
                    id: { type: 'string', format: 'uuid', description: 'ID del ciclo académico' }
                }
            },
            body: {
                type: 'object',
                properties: {
                    nombre: { type: 'string' },
                    fechaInicio: { type: 'string', format: 'date' },
                    fechaFin: { type: 'string', format: 'date' },
                    estado: { type: 'string' }
                }
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid' },
                        nombre: { type: 'string' },
                        fechaInicio: { type: 'string' },
                        fechaFin: { type: 'string' },
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

        const ciclo = await app.db.query.ciclosAcademicos.findFirst({ where: eq(ciclosAcademicos.id, id) });
        if (!ciclo) return reply.status(404).send({ error: 'Ciclo académico no encontrado' });

        try {
            const [actualizado] = await app.db.update(ciclosAcademicos).set(body).where(eq(ciclosAcademicos.id, id)).returning();
            return actualizado;
        } catch (error) { return handleDBError(reply, error); }
    });

    // DELETE
    app.delete('/ciclos/:id', {
        schema: {
            description: 'Eliminar un ciclo académico (Solo Admin)',
            tags: ['Académico - Ciclos'],
            security: [{ bearerAuth: [] }],
            params: {
                type: 'object',
                properties: {
                    id: { type: 'string', format: 'uuid', description: 'ID del ciclo académico' }
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
        const ciclo = await app.db.query.ciclosAcademicos.findFirst({ where: eq(ciclosAcademicos.id, id) });
        if (!ciclo) return reply.status(404).send({ error: 'Ciclo académico no encontrado' });

        try {
            await app.db.delete(ciclosAcademicos).where(eq(ciclosAcademicos.id, id));
            return { message: 'Ciclo académico eliminado correctamente' };
        } catch (error) { return handleDBError(reply, error); }
    });

    // READ DETAILS
    app.get('/ciclos/:id/cursos-programados', {
        schema: {
            description: 'Obtener cursos programados para un ciclo académico',
            tags: ['Académico - Ciclos'],
            security: [{ bearerAuth: [] }],
            params: {
                type: 'object',
                properties: {
                    id: { type: 'string', format: 'uuid', description: 'ID del ciclo académico' }
                }
            }
        },
        preHandler: [app.authenticate]
    }, async (req, reply) => {
        const { id } = req.params as any;
        return app.db.query.cursosProgramados.findMany({
            where: eq(cursosProgramados.cicloAcademicoId, id),
            with: { cursoBase: true, profesor: true }
        });
    });
};