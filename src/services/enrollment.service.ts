import { db } from '../db';
import { cursosProgramados, detalleMatriculas, matriculas } from '../db/schema';
import { eq, gt, sql, and } from 'drizzle-orm';

export async function enrollCourse(estudianteId: string, cursoProgramadoId: string, cicloId: string) {
    return db.transaction(async (tx) => {
        // 1. Intentar restar cupo de forma atómica (Evita Overselling)
        const [cursoActualizado] = await tx
            .update(cursosProgramados)
            .set({ cuposDisponibles: sql`${cursosProgramados.cuposDisponibles} - 1` })
            .where(and(
                eq(cursosProgramados.id, cursoProgramadoId),
                gt(cursosProgramados.cuposDisponibles, 0),
                eq(cursosProgramados.cicloAcademicoId, cicloId)
            ))
            .returning();

        if (!cursoActualizado) {
            throw new Error('No hay cupos disponibles o el curso no existe para este ciclo');
        }

        // 2. Obtener o crear cabecera de matrícula
        let matricula = await tx.query.matriculas.findFirst({
            where: and(eq(matriculas.estudianteId, estudianteId), eq(matriculas.cicloAcademicoId, cicloId))
        });

        if (!matricula) {
            [matricula] = await tx.insert(matriculas).values({
                estudianteId,
                cicloAcademicoId: cicloId,
                estado: 'Confirmada'
            }).returning();
        }

        // 3. Insertar detalle
        await tx.insert(detalleMatriculas).values({
            matriculaId: matricula.id,
            cursoProgramadoId,
        });

        return { success: true, cuposRestantes: cursoActualizado.cuposDisponibles };
    });
}