import { pgTable, uuid, varchar, integer, boolean, decimal, date, timestamp, uniqueIndex, jsonb, bigint, primaryKey } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const usuarios = pgTable('usuarios', {
    id: uuid('id').primaryKey().defaultRandom(),
    authUserId: uuid('auth_user_id').unique(), 
    email: varchar('email', { length: 255 }).unique().notNull(),
    dni: varchar('dni', { length: 20 }),
    nombre: varchar('nombre', { length: 100 }).notNull(),
    apellido: varchar('apellido', { length: 100 }).notNull(),
    telefono: varchar('telefono', { length: 20 }),
    domicilio: varchar('domicilio', { length: 255 }),
    fechaNacimiento: date('fecha_nacimiento'),
    activo: boolean('activo').default(true).notNull(), // Kill switch global del sistema
    requiereCambioClave: boolean('requiere_cambio_clave').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const roles = pgTable('roles', {
    id: uuid('id').primaryKey().defaultRandom(),
    nombre: varchar('nombre', { length: 50 }).unique().notNull(),
});

export const menus = pgTable('menus', {
    id: uuid('id').primaryKey().defaultRandom(),
    parentId: uuid('parent_id'),
    nombre: varchar('nombre', { length: 100 }).notNull(),
    ruta: varchar('ruta', { length: 255 }),
    icono: varchar('icono', { length: 50 }),
    orden: integer('orden').default(0),
    activo: boolean('activo').default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const carreras = pgTable('carreras', {
    id: uuid('id').primaryKey().defaultRandom(),
    codigo: varchar('codigo', { length: 20 }).unique().notNull(),
    nombre: varchar('nombre', { length: 150 }).notNull(),
    totalCiclos: integer('total_ciclos').default(4).notNull(),
});

export const cursosBase = pgTable('cursos_base', {
    id: uuid('id').primaryKey().defaultRandom(),
    codigo: varchar('codigo', { length: 20 }).unique().notNull(),
    nombre: varchar('nombre', { length: 150 }).notNull(),
    creditos: integer('creditos').default(0).notNull(),
    horas: integer('horas').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const ciclosAcademicos = pgTable('ciclos_academicos', {
    id: uuid('id').primaryKey().defaultRandom(),
    nombre: varchar('nombre', { length: 100 }).notNull(),
    fechaInicio: date('fecha_inicio').notNull(),
    fechaFin: date('fecha_fin').notNull(),
    estado: varchar('estado', { length: 20 }).default('Planificado').notNull(),
});

export const usuarioRoles = pgTable('usuario_roles', {
    usuarioId: uuid('usuario_id').references(() => usuarios.id, { onDelete: 'cascade' }).notNull(),
    rolId: uuid('rol_id').references(() => roles.id, { onDelete: 'cascade' }).notNull(),
    estado: varchar('estado', { length: 20 }).default('Activo').notNull(), // ESTADO CONTEXTUAL
}, (table) => [primaryKey({ columns: [table.usuarioId, table.rolId] })]);

export const rolMenu = pgTable('rol_menu', {
    rolId: uuid('rol_id').references(() => roles.id, { onDelete: 'cascade' }).notNull(),
    menuId: uuid('menu_id').references(() => menus.id, { onDelete: 'cascade' }).notNull(),
}, (table) => [primaryKey({ columns: [table.rolId, table.menuId] })]);

export const mallaCurricular = pgTable('malla_curricular', {
    id: uuid('id').primaryKey().defaultRandom(),
    carreraId: uuid('carrera_id').references(() => carreras.id, { onDelete: 'cascade' }).notNull(),
    cursoBaseId: uuid('curso_base_id').references(() => cursosBase.id, { onDelete: 'restrict' }).notNull(),
    ciclo: integer('ciclo').notNull(),
    tipo: varchar('tipo', { length: 20 }).default('Obligatorio').notNull(),
}, (table) => [uniqueIndex('malla_unique').on(table.carreraId, table.cursoBaseId, table.ciclo)]);

export const cursosProgramados = pgTable('cursos_programados', {
    id: uuid('id').primaryKey().defaultRandom(),
    cursoBaseId: uuid('curso_base_id').references(() => cursosBase.id, { onDelete: 'restrict' }).notNull(),
    cicloAcademicoId: uuid('ciclo_academico_id').references(() => ciclosAcademicos.id, { onDelete: 'restrict' }).notNull(),
    profesorId: uuid('profesor_id').references(() => usuarios.id, { onDelete: 'set null' }),
    nombreSnapshot: varchar('nombre_snapshot', { length: 150 }).notNull(),
    creditosSnapshot: integer('creditos_snapshot').notNull(),
    cupoTotal: integer('cupo_total').notNull(),
    cuposDisponibles: integer('cupos_disponibles').notNull(),
    horario: varchar('horario', { length: 100 }),
    aula: varchar('aula', { length: 50 }),
    estado: varchar('estado', { length: 20 }).default('Vigente').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const estructuraEvaluacion = pgTable('estructura_evaluacion', {
    id: uuid('id').primaryKey().defaultRandom(),
    cursoProgramadoId: uuid('curso_programado_id').references(() => cursosProgramados.id, { onDelete: 'cascade' }).notNull(),
    nombreEvaluacion: varchar('nombre_evaluacion', { length: 100 }).notNull(),
    pesoPorcentual: decimal('peso_porcentual', { precision: 5, scale: 2 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [uniqueIndex('eval_unique').on(table.cursoProgramadoId, table.nombreEvaluacion)]);

export const notasDetalle = pgTable('notas_detalle', {
    id: uuid('id').primaryKey().defaultRandom(),
    estudianteId: uuid('estudiante_id').references(() => usuarios.id, { onDelete: 'restrict' }).notNull(),
    estructuraEvaluacionId: uuid('estructura_evaluacion_id').references(() => estructuraEvaluacion.id, { onDelete: 'cascade' }).notNull(),
    notaCruda: decimal('nota_cruda', { precision: 5, scale: 2 }).notNull(),
}, (table) => [uniqueIndex('nota_detalle_unique').on(table.estudianteId, table.estructuraEvaluacionId)]);

export const asistencias = pgTable('asistencias', {
    id: uuid('id').primaryKey().defaultRandom(),
    cursoProgramadoId: uuid('curso_programado_id').references(() => cursosProgramados.id, { onDelete: 'cascade' }).notNull(),
    estudianteId: uuid('estudiante_id').references(() => usuarios.id, { onDelete: 'restrict' }).notNull(),
    fechaSesion: date('fecha_sesion').notNull(),
    estado: varchar('estado', { length: 20 }).default('Presente').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [uniqueIndex('asistencia_unique').on(table.cursoProgramadoId, table.estudianteId, table.fechaSesion)]);

export const matriculas = pgTable('matriculas', {
    id: uuid('id').primaryKey().defaultRandom(),
    estudianteId: uuid('estudiante_id').references(() => usuarios.id, { onDelete: 'restrict' }).notNull(),
    cicloAcademicoId: uuid('ciclo_academico_id').references(() => ciclosAcademicos.id, { onDelete: 'restrict' }).notNull(),
    estado: varchar('estado', { length: 20 }).default('Pendiente').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [uniqueIndex('matricula_unique').on(table.estudianteId, table.cicloAcademicoId)]);

export const detalleMatriculas = pgTable('detalle_matriculas', {
    id: uuid('id').primaryKey().defaultRandom(),
    matriculaId: uuid('matricula_id').references(() => matriculas.id, { onDelete: 'cascade' }).notNull(),
    cursoProgramadoId: uuid('curso_programado_id').references(() => cursosProgramados.id, { onDelete: 'restrict' }).notNull(),
    estado: varchar('estado', { length: 20 }).default('Inscrito').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [uniqueIndex('detalle_matricula_unique').on(table.matriculaId, table.cursoProgramadoId)]);

export const historialNotas = pgTable('historial_notas', {
    id: uuid('id').primaryKey().defaultRandom(),
    estudianteId: uuid('estudiante_id').references(() => usuarios.id, { onDelete: 'restrict' }).notNull(),
    cursoProgramadoId: uuid('curso_programado_id').references(() => cursosProgramados.id, { onDelete: 'restrict' }).notNull(),
    notaFinal: decimal('nota_final', { precision: 5, scale: 2 }),
    estado: varchar('estado', { length: 20 }).default('En Curso').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [uniqueIndex('historial_unique').on(table.estudianteId, table.cursoProgramadoId)]);


// ================= RELACIONES =================

export const usuariosRelations = relations(usuarios, ({ many }) => ({
    roles: many(usuarioRoles),
    cursosDictados: many(cursosProgramados),
    matriculas: many(matriculas),
}));

export const rolesRelations = relations(roles, ({ many }) => ({
    usuarios: many(usuarioRoles),
    menus: many(rolMenu),
}));

export const menusRelations = relations(menus, ({ one, many }) => ({
    parent: one(menus, { fields: [menus.parentId], references: [menus.id], relationName: 'submenus' }),
    children: many(menus, { relationName: 'submenus' }),
    roles: many(rolMenu),
}));

export const usuarioRolesRelations = relations(usuarioRoles, ({ one }) => ({
    usuario: one(usuarios, { fields: [usuarioRoles.usuarioId], references: [usuarios.id] }),
    rol: one(roles, { fields: [usuarioRoles.rolId], references: [roles.id] }),
}));

export const rolMenuRelations = relations(rolMenu, ({ one }) => ({
    rol: one(roles, { fields: [rolMenu.rolId], references: [roles.id] }),
    menu: one(menus, { fields: [rolMenu.menuId], references: [menus.id] }),
}));

export const carrerasRelations = relations(carreras, ({ many }) => ({ mallaCurricular: many(mallaCurricular) }));
export const cursosBaseRelations = relations(cursosBase, ({ many }) => ({ mallaCurricular: many(mallaCurricular), instancias: many(cursosProgramados) }));
export const mallaCurricularRelations = relations(mallaCurricular, ({ one }) => ({
    carrera: one(carreras, { fields: [mallaCurricular.carreraId], references: [carreras.id] }),
    cursoBase: one(cursosBase, { fields: [mallaCurricular.cursoBaseId], references: [cursosBase.id] }),
}));
export const ciclosAcademicosRelations = relations(ciclosAcademicos, ({ many }) => ({ cursosProgramados: many(cursosProgramados), matriculas: many(matriculas) }));

// RELACIÓN CORREGIDA (Incluye asistencias)
export const cursosProgramadosRelations = relations(cursosProgramados, ({ one, many }) => ({
    cursoBase: one(cursosBase, { fields: [cursosProgramados.cursoBaseId], references: [cursosBase.id] }),
    cicloAcademico: one(ciclosAcademicos, { fields: [cursosProgramados.cicloAcademicoId], references: [ciclosAcademicos.id] }),
    profesor: one(usuarios, { fields: [cursosProgramados.profesorId], references: [usuarios.id] }),
    estructuraEvaluacion: many(estructuraEvaluacion),
    detalleMatriculas: many(detalleMatriculas),
    historialNotas: many(historialNotas),
    asistencias: many(asistencias), // AQUÍ ESTÁ LA NUEVA RELACIÓN
}));

export const estructuraEvaluacionRelations = relations(estructuraEvaluacion, ({ one, many }) => ({
    cursoProgramado: one(cursosProgramados, { fields: [estructuraEvaluacion.cursoProgramadoId], references: [cursosProgramados.id] }),
    notas: many(notasDetalle),
}));
export const notasDetalleRelations = relations(notasDetalle, ({ one }) => ({
    estudiante: one(usuarios, { fields: [notasDetalle.estudianteId], references: [usuarios.id] }),
    estructuraEvaluacion: one(estructuraEvaluacion, { fields: [notasDetalle.estructuraEvaluacionId], references: [estructuraEvaluacion.id] }),
}));

export const asistenciasRelations = relations(asistencias, ({ one }) => ({
    cursoProgramado: one(cursosProgramados, { fields: [asistencias.cursoProgramadoId], references: [cursosProgramados.id] }),
    estudiante: one(usuarios, { fields: [asistencias.estudianteId], references: [usuarios.id] }),
}));

export const matriculasRelations = relations(matriculas, ({ one, many }) => ({
    estudiante: one(usuarios, { fields: [matriculas.estudianteId], references: [usuarios.id] }),
    cicloAcademico: one(ciclosAcademicos, { fields: [matriculas.cicloAcademicoId], references: [ciclosAcademicos.id] }),
    detalles: many(detalleMatriculas),
}));
export const detalleMatriculasRelations = relations(detalleMatriculas, ({ one }) => ({
    matricula: one(matriculas, { fields: [detalleMatriculas.matriculaId], references: [matriculas.id] }),
    cursoProgramado: one(cursosProgramados, { fields: [detalleMatriculas.cursoProgramadoId], references: [cursosProgramados.id] }),
}));
export const historialNotasRelations = relations(historialNotas, ({ one }) => ({
    estudiante: one(usuarios, { fields: [historialNotas.estudianteId], references: [usuarios.id] }),
    cursoProgramado: one(cursosProgramados, { fields: [historialNotas.cursoProgramadoId], references: [cursosProgramados.id] }),
}));