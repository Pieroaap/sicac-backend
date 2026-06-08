import { db } from '../db';
import { estructuraEvaluacion, notasDetalle, historialNotas } from '../db/schema';
import { eq, and } from 'drizzle-orm';

export async function calculateFinalGrade(estudianteId: string, cursoProgramadoId: string) {
    return db.transaction(async (tx) => {
        const estructuras = await tx.query.estructuraEvaluacion.findMany({
            where: eq(estructuraEvaluacion.cursoProgramadoId, cursoProgramadoId),
        });

        if (estructuras.length === 0) throw new Error('No hay estructura de evaluación definida para este curso');

        let notaFinalCalculada = 0;

        for (const estructura of estructuras) {
            const notaDetalle = await tx.query.notasDetalle.findFirst({
                where: and(
                    eq(notasDetalle.estudianteId, estudianteId),
                    eq(notasDetalle.estructuraEvaluacionId, estructura.id)
                ),
            });

            if (!notaDetalle) throw new Error(`Falta la nota para: ${estructura.nombreEvaluacion}`);

            const peso = Number(estructura.pesoPorcentual) / 100;
            notaFinalCalculada += Number(notaDetalle.notaCruda) * peso;
        }

        await tx.insert(historialNotas)
            .values({
                estudianteId,
                cursoProgramadoId,
                notaFinal: notaFinalCalculada.toFixed(2),
                estado: notaFinalCalculada >= 11 ? 'Aprobado' : 'Desaprobado', // Escala 0-20
            })
            .onConflictDoUpdate({
                target: [historialNotas.estudianteId, historialNotas.cursoProgramadoId],
                set: { notaFinal: notaFinalCalculada.toFixed(2), estado: notaFinalCalculada >= 11 ? 'Aprobado' : 'Desaprobado' }
            });

        return notaFinalCalculada;
    });
}