// =====================================================
// db/mysql.js — Pool y helpers de base de datos
// =====================================================

const mysql = require('mysql2/promise');

// ---- CONFIGURACIÓN ----
const DB_CONFIG = {
  host:     process.env.DB_HOST     || 'localhost',
  port:     process.env.DB_PORT     || 3306,
  user:     process.env.DB_USER     || 'root',
  password: process.env.DB_PASSWORD || 'root',
  database: process.env.DB_NAME     || 'gestion_academica',
};

let pool;

function getPool() {
  if (!pool) {
    pool = mysql.createPool({ ...DB_CONFIG, waitForConnections: true, connectionLimit: 10 });
  }
  return pool;
}

// =====================================================
// buildDbJson — Lee las tablas y reconstruye el JSON
//               que espera el frontend, filtrado por userId.
//               Sin userId: solo devuelve usuarios (login/recovery).
// =====================================================
async function buildDbJson(conn, userId) {
  // Salones globales (necesarios para construir el resto)
  const [salones] = await conn.query('SELECT * FROM salones');
  const salonPorId = {};
  for (const s of salones) salonPorId[s.id] = s;

  // Cursos — filtrar por usuario; sin userId devuelve vacío
  const [cursos] = userId
    ? await conn.query('SELECT * FROM cursos WHERE id_usuario = ?', [userId])
    : [[]];

  const cursoIds = cursos.map(c => c.id);

  // Competencias de los cursos del usuario
  const [competencias] = cursoIds.length
    ? await conn.query(
        'SELECT * FROM competencias_curso WHERE id_curso IN (?) ORDER BY id_curso, bimestre, posicion',
        [cursoIds]
      )
    : [[]];

  const compPorCurso = {};
  for (const r of competencias) {
    if (!compPorCurso[r.id_curso]) compPorCurso[r.id_curso] = {};
    if (!compPorCurso[r.id_curso][r.bimestre]) compPorCurso[r.id_curso][r.bimestre] = [];
    compPorCurso[r.id_curso][r.bimestre].push(r.texto);
  }

  const cursosOut = cursos.map(c => ({
    id: c.id, name: c.nombre, color: c.color,
    userId: c.id_usuario || null,
    competencias: compPorCurso[c.id] || {},
    createdAt: c.creado_en,
  }));

  // Secciones de los cursos del usuario
  const [secciones] = cursoIds.length
    ? await conn.query('SELECT * FROM secciones WHERE id_curso IN (?)', [cursoIds])
    : [[]];

  const secIds = secciones.map(s => s.id);

  const [horarios] = secIds.length
    ? await conn.query(
        'SELECT * FROM horario_secciones WHERE id_seccion IN (?) ORDER BY id_seccion, posicion',
        [secIds]
      )
    : [[]];

  const horarioPorSeccion = {};
  for (const r of horarios) {
    if (!horarioPorSeccion[r.id_seccion]) horarioPorSeccion[r.id_seccion] = [];
    horarioPorSeccion[r.id_seccion].push(r);
  }

  const seccionesOut = {};
  for (const sec of secciones) {
    const salon = salonPorId[sec.id_salon] || {};
    if (!seccionesOut[sec.id_curso]) seccionesOut[sec.id_curso] = [];
    const filas = horarioPorSeccion[sec.id] || [];
    seccionesOut[sec.id_curso].push({
      id: sec.id,
      grade: salon.grado,
      letter: salon.letra,
      createdAt: sec.creado_en,
      schedule: {
        days:  filas.map(r => r.dia),
        times: Object.fromEntries(filas.map(r => [r.dia, { start: r.hora_inicio, end: r.hora_fin }])),
      },
      competencias: compPorCurso[sec.id_curso] || {},
    });
  }

  // Alumnos — solo los salones que usan las secciones del usuario
  const salonIdsUsados = [...new Set(secciones.map(s => s.id_salon))];
  const [alumnos] = salonIdsUsados.length
    ? await conn.query('SELECT * FROM alumnos WHERE id_salon IN (?)', [salonIdsUsados])
    : [[]];

  const alumnosOut = {};
  for (const a of alumnos) {
    const salon = salonPorId[a.id_salon] || {};
    const clave = `${salon.grado}_${salon.letra}`;
    if (!alumnosOut[clave]) alumnosOut[clave] = [];
    const alu = { id: a.id, name: a.nombre };
    if (a.observacion) alu.observation = a.observacion;
    if (a.retirado)    alu.retired = true;
    alumnosOut[clave].push(alu);
  }

  // Actividades — solo las secciones del usuario
  const [actividades] = secIds.length
    ? await conn.query(`
        SELECT a.id, a.id_seccion, a.nombre, a.bimestre, a.tipo, a.fecha_entrega, a.peso,
               s.id_curso,
               cc.posicion AS competencia_idx
        FROM actividades a
        JOIN secciones s ON a.id_seccion = s.id
        LEFT JOIN competencias_curso cc ON a.id_competencia = cc.id
        WHERE a.id_seccion IN (?)
      `, [secIds])
    : [[]];

  const actividadesOut = {};
  for (const a of actividades) {
    const clave = `${a.id_curso}_${a.id_seccion}`;
    if (!actividadesOut[clave]) actividadesOut[clave] = [];
    actividadesOut[clave].push({
      id: a.id, name: a.nombre, bimestre: a.bimestre,
      competenciaIdx: a.competencia_idx ?? 0,
      type: a.tipo, dueDate: a.fecha_entrega, weight: a.peso || '',
    });
  }

  // Notas — solo las secciones del usuario
  const [notas] = secIds.length
    ? await conn.query(`
        SELECT n.id_alumno, n.id_actividad, n.nota,
               a.id_seccion, s.id_curso
        FROM notas n
        JOIN actividades a ON n.id_actividad = a.id
        JOIN secciones   s ON a.id_seccion   = s.id
        WHERE a.id_seccion IN (?)
      `, [secIds])
    : [[]];

  const notasOut = {};
  for (const n of notas) {
    const clave = `${n.id_curso}_${n.id_seccion}`;
    if (!notasOut[clave]) notasOut[clave] = {};
    if (!notasOut[clave][n.id_alumno]) notasOut[clave][n.id_alumno] = {};
    notasOut[clave][n.id_alumno][n.id_actividad] = n.nota;
  }

  // Usuarios — sin sesión: solo {id, email, username} para el flujo de recuperación
  //            con sesión: perfil completo necesario para cuenta y sidebar
  const [usuarios] = await conn.query('SELECT * FROM usuarios');
  const usuariosOut = usuarios.map(u => {
    if (!userId) return { id: u.id, email: u.correo, username: u.usuario };
    const obj = {
      id: u.id,
      username: u.usuario,
      displayName: u.nombre_display || u.usuario,
      email: u.correo,
      rol: u.rol || 'docente',
      activo: u.activo !== undefined ? !!u.activo : true,
      createdAt: u.creado_en,
    };
    if (u.foto) obj.photo = u.foto;
    return obj;
  });

  // Referencia de horarios (global)
  const [[refDias], [refFranjas]] = await Promise.all([
    conn.query('SELECT dia FROM referencia_dias ORDER BY posicion'),
    conn.query('SELECT franja FROM referencia_franjas ORDER BY posicion'),
  ]);

  return {
    courses:    cursosOut,
    sections:   seccionesOut,
    students:   alumnosOut,
    activities: actividadesOut,
    grades:     notasOut,
    users:      usuariosOut,
    scheduleReference: {
      days:      refDias.map(r => r.dia),
      timeSlots: refFranjas.map(r => r.franja),
    },
  };
}

// =====================================================
// saveDbJson — Guarda el JSON del frontend en MySQL,
//              afectando SOLO los datos del userId dado.
//              Otros docentes no se tocan.
// =====================================================
async function saveDbJson(conn, data, userId) {
  const idsCursos = (data.courses || []).map(c => c.id);

  const parsearClave = (clave) => {
    for (const id of idsCursos) {
      if (clave.startsWith(id + '_')) return [id, clave.slice(id.length + 1)];
    }
    return [null, null];
  };

  await conn.beginTransaction();
  try {
    // Borrar SOLO los cursos del usuario — CASCADE elimina automáticamente:
    // competencias_curso, secciones, horario_secciones, actividades, notas
    await conn.query('DELETE FROM cursos WHERE id_usuario = ?', [userId]);

    // 1. Salones — tabla global compartida; INSERT IGNORE previene duplicados
    for (const secs of Object.values(data.sections || {}))
      for (const sec of secs)
        await conn.query(
          'INSERT IGNORE INTO salones (grado, letra) VALUES (?, ?)',
          [sec.grade, sec.letter]
        );
    for (const clave of Object.keys(data.students || {})) {
      const us = clave.indexOf('_');
      if (us !== -1)
        await conn.query(
          'INSERT IGNORE INTO salones (grado, letra) VALUES (?, ?)',
          [clave.slice(0, us), clave.slice(us + 1)]
        );
    }

    // Cargar mapeo grado_letra → id después de insertar salones
    const [filasSalones] = await conn.query('SELECT id, grado, letra FROM salones');
    const mapaSalones = {};
    for (const s of filasSalones) mapaSalones[`${s.grado}_${s.letra}`] = s.id;

    // 2. Actualizar perfil del usuario actual (sin tocar contraseña ni rol)
    const usuarioFrontend = (data.users || []).find(u => u.id === userId);
    if (usuarioFrontend) {
      await conn.query(
        'UPDATE usuarios SET nombre_display = ?, correo = ?, foto = ? WHERE id = ?',
        [
          usuarioFrontend.displayName || null,
          usuarioFrontend.email || null,
          usuarioFrontend.photo || null,
          userId,
        ]
      );
    }

    // 3. Cursos y competencias del usuario
    const mapaCompIdx = {};  // "idCurso_bimestre_posicion" → id de competencias_curso

    for (const c of (data.courses || [])) {
      await conn.query(
        'INSERT INTO cursos (id, nombre, color, id_usuario, creado_en) VALUES (?, ?, ?, ?, ?)',
        [c.id, c.name, c.color || null, userId, c.createdAt || null]
      );
      for (const [bim, comps] of Object.entries(c.competencias || {})) {
        for (let i = 0; i < comps.length; i++) {
          const [res] = await conn.query(
            'INSERT INTO competencias_curso (id_curso, bimestre, posicion, texto) VALUES (?, ?, ?, ?)',
            [c.id, parseInt(bim), i, comps[i]]
          );
          mapaCompIdx[`${c.id}_${bim}_${i}`] = res.insertId;
        }
      }
    }

    // 4. Secciones y horarios
    for (const [idCurso, secs] of Object.entries(data.sections || {})) {
      for (const sec of secs) {
        const idSalon = mapaSalones[`${sec.grade}_${sec.letter}`];
        await conn.query(
          'INSERT INTO secciones (id, id_curso, id_salon, creado_en) VALUES (?, ?, ?, ?)',
          [sec.id, idCurso, idSalon, sec.createdAt || null]
        );
        const dias = sec.schedule?.days || [];
        for (let i = 0; i < dias.length; i++) {
          const dia = dias[i];
          const t = sec.schedule?.times?.[dia] || {};
          await conn.query(
            'INSERT INTO horario_secciones (id_seccion, dia, hora_inicio, hora_fin, posicion) VALUES (?, ?, ?, ?, ?)',
            [sec.id, dia, t.start || null, t.end || null, i]
          );
        }
      }
    }

    // 5. Alumnos — upsert porque son compartidos entre docentes del mismo salon
    for (const [clave, alums] of Object.entries(data.students || {})) {
      const idSalon = mapaSalones[clave];
      if (!idSalon) continue;
      for (const a of alums) {
        await conn.query(
          `INSERT INTO alumnos (id, id_salon, nombre, observacion, retirado)
           VALUES (?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             nombre      = VALUES(nombre),
             observacion = VALUES(observacion),
             retirado    = VALUES(retirado)`,
          [a.id, idSalon, a.name, a.observation || null, a.retired ? 1 : 0]
        );
      }
    }

    // 6. Actividades
    for (const [clave, acts] of Object.entries(data.activities || {})) {
      const [idCurso, idSeccion] = parsearClave(clave);
      if (!idCurso) continue;
      for (const a of acts) {
        const idComp = mapaCompIdx[`${idCurso}_${a.bimestre}_${a.competenciaIdx}`] ?? null;
        await conn.query(
          'INSERT INTO actividades (id, id_seccion, nombre, bimestre, id_competencia, tipo, fecha_entrega, peso) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [a.id, idSeccion, a.name, a.bimestre, idComp, a.type, a.dueDate, a.weight || '']
        );
      }
    }

    // 7. Notas
    for (const notasAlumnos of Object.values(data.grades || {})) {
      for (const [idAlumno, notasActs] of Object.entries(notasAlumnos)) {
        for (const [idActividad, nota] of Object.entries(notasActs)) {
          await conn.query(
            'INSERT INTO notas (id_alumno, id_actividad, nota) VALUES (?, ?, ?)',
            [idAlumno, idActividad, nota]
          );
        }
      }
    }

    // 8. Referencia de horarios — global; INSERT IGNORE no falla si ya existen
    const ref = data.scheduleReference || {};
    for (let i = 0; i < (ref.days || []).length; i++)
      await conn.query('INSERT IGNORE INTO referencia_dias (dia, posicion) VALUES (?, ?)', [ref.days[i], i]);
    for (let i = 0; i < (ref.timeSlots || []).length; i++)
      await conn.query('INSERT IGNORE INTO referencia_franjas (franja, posicion) VALUES (?, ?)', [ref.timeSlots[i], i]);

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  }
}

module.exports = { getPool, buildDbJson, saveDbJson, DB_CONFIG };
