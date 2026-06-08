import type { FastifyReply } from 'fastify';

export function handleDBError(reply: FastifyReply, error: any) {
    console.error(error);
    if (error.code === '23505') {
        return reply.status(409).send({ error: 'Violación de restricción única: El registro ya existe o hay un conflicto.' });
    }
    if (error.code === '23503') {
        return reply.status(422).send({ error: 'Violación de clave foránea: El registro referenciado no existe.' });
    }
    return reply.status(500).send({ error: 'Error interno del servidor' });
}