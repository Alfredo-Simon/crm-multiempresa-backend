import express from 'express';
import pool from '../config/database.js';
import { autenticar } from './auth.js';

const router = express.Router();

// Aplicar autenticación a todas las rutas
router.use(autenticar);

/**
 * GET /api/dashboard/stats
 * Obtener estadísticas generales
 */
router.get('/stats', async (req, res) => {
  const client = await pool.connect();
  try {
    const usuario_empresa_id = req.usuario?.empresa_id;
    const es_superadmin = req.usuario?.role === 'superadmin';

    // 1. Total de leads
    const totalLeadsQuery = es_superadmin 
      ? 'SELECT COUNT(*) as total FROM clientes'
      : 'SELECT COUNT(*) as total FROM clientes WHERE empresa_id = $1';
    const totalLeadsParams = es_superadmin ? [] : [usuario_empresa_id];
    const totalLeadsResult = await client.query(totalLeadsQuery, totalLeadsParams);

    // 2. Leads pendientes (estado = 'recibido')
    const pendientesQuery = es_superadmin
      ? 'SELECT COUNT(*) as pendientes FROM clientes WHERE estado = $1'
      : 'SELECT COUNT(*) as pendientes FROM clientes WHERE empresa_id = $1 AND estado = $2';
    const pendientesParams = es_superadmin ? ['recibido'] : [usuario_empresa_id, 'recibido'];
    const pendientesResult = await client.query(pendientesQuery, pendientesParams);

    // 3. Leads contestados (estado = 'contestado')
    const contestadosQuery = es_superadmin
      ? 'SELECT COUNT(*) as contestados FROM clientes WHERE estado = $1'
      : 'SELECT COUNT(*) as contestados FROM clientes WHERE empresa_id = $1 AND estado = $2';
    const contestadosParams = es_superadmin ? ['contestado'] : [usuario_empresa_id, 'contestado'];
    const contestadosResult = await client.query(contestadosQuery, contestadosParams);

    const total = parseInt(totalLeadsResult.rows[0].total);
    const pendientes = parseInt(pendientesResult.rows[0].pendientes);
    const contestados = parseInt(contestadosResult.rows[0].contestados);

    res.json({
      success: true,
      stats: {
        total,
        pendientes,
        contestados,
        porcentaje_contestados: total > 0 ? Math.round((contestados / total) * 100) : 0
      }
    });

  } catch (error) {
    console.error('Error en dashboard/stats:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener estadísticas'
    });
  } finally {
    client.release();
  }
});

/**
 * GET /api/dashboard/leads
 * Obtener lista de leads con filtros y paginación
 */
router.get('/leads', async (req, res) => {
  const client = await pool.connect();
  try {
    const usuario_empresa_id = req.usuario?.empresa_id;
    const es_superadmin = req.usuario?.role === 'superadmin';
    const { estado, origen, empresa_id, pagina = 1, limite = 20 } = req.query;

    // Construir WHERE clause dinámico
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (!es_superadmin) {
      conditions.push(`c.empresa_id = $${paramIndex}`);
      params.push(usuario_empresa_id);
      paramIndex++;
    } else if (empresa_id) {
      conditions.push(`c.empresa_id = $${paramIndex}`);
      params.push(empresa_id);
      paramIndex++;
    }

    if (estado) {
      conditions.push(`c.estado = $${paramIndex}`);
      params.push(estado);
      paramIndex++;
    }

    if (origen) {
      conditions.push(`c.origen = $${paramIndex}`);
      params.push(origen);
      paramIndex++;
    }

    const whereSQL = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (parseInt(pagina) - 1) * parseInt(limite);

    // Total de registros
    const totalQuery = `SELECT COUNT(*) as total FROM clientes c ${whereSQL}`;
    const totalResult = await client.query(totalQuery, params);
    const total = totalResult.rows[0].total;

    // Leads con información de empresa
    const leadsParams = [...params, parseInt(limite), offset];
    const leadsQuery = `
      SELECT 
        c.id,
        c.nombre,
        c.apellidos,
        c.email,
        c.telefono,
        c.mensaje,
        c.estado,
        c.origen,
        c.notas as respuesta_mensaje,
        c.created_at,
        c.updated_at as fecha_cambio_estado,
        e.nombre as empresa_nombre,
        e.id as empresa_id
       FROM clientes c
       LEFT JOIN empresas e ON c.empresa_id = e.id
       ${whereSQL}
       ORDER BY c.created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const leadsResult = await client.query(leadsQuery, leadsParams);

    res.json({
      success: true,
      leads: leadsResult.rows,
      paginacion: {
        total,
        pagina: parseInt(pagina),
        limite: parseInt(limite),
        totalPaginas: Math.ceil(total / parseInt(limite))
      }
    });

  } catch (error) {
    console.error('Error en dashboard/leads:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener leads'
    });
  } finally {
    client.release();
  }
});

/**
 * GET /api/dashboard/search
 * Buscar leads por nombre, email o teléfono
 */
router.get('/search', async (req, res) => {
  const client = await pool.connect();
  try {
    const usuario_empresa_id = req.usuario?.empresa_id;
    const es_superadmin = req.usuario?.role === 'superadmin';
    const { q = '', empresa_id, estado } = req.query;

    // Construir WHERE clause
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    // Filtro por empresa
    if (!es_superadmin) {
      conditions.push(`c.empresa_id = $${paramIndex}`);
      params.push(usuario_empresa_id);
      paramIndex++;
    } else if (empresa_id) {
      conditions.push(`c.empresa_id = $${paramIndex}`);
      params.push(empresa_id);
      paramIndex++;
    }

    // Búsqueda por nombre, email o teléfono
    if (q) {
      conditions.push(`(c.nombre ILIKE $${paramIndex} 
                       OR c.apellidos ILIKE $${paramIndex} 
                       OR c.email ILIKE $${paramIndex} 
                       OR c.telefono ILIKE $${paramIndex})`);
      params.push(`%${q}%`);
      paramIndex++;
    }

    // Filtro por estado (opcional)
    if (estado) {
      conditions.push(`c.estado = $${paramIndex}`);
      params.push(estado);
      paramIndex++;
    }

    const whereSQL = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const query = `
      SELECT 
        c.id,
        c.nombre,
        c.apellidos,
        c.email,
        c.telefono,
        c.mensaje,
        c.estado,
        c.origen,
        c.created_at,
        e.nombre as empresa_nombre,
        e.id as empresa_id
       FROM clientes c
       LEFT JOIN empresas e ON c.empresa_id = e.id
       ${whereSQL}
       ORDER BY c.created_at DESC
       LIMIT 50
    `;

    const result = await client.query(query, params);

    res.json({
      success: true,
      leads: result.rows,
      total: result.rows.length
    });

  } catch (error) {
    console.error('Error en dashboard/search:', error);
    res.status(500).json({
      success: false,
      error: 'Error en búsqueda'
    });
  } finally {
    client.release();
  }
});

/**
 * GET /api/dashboard/leads/:id
 * Obtener ficha completa de un lead con historial
 */
router.get('/leads/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const usuario_empresa_id = req.usuario?.empresa_id;
    const es_superadmin = req.usuario?.role === 'superadmin';

    // Obtener datos del lead
    let query = `
      SELECT c.*, e.nombre as empresa_nombre, e.id as empresa_id
       FROM clientes c
       LEFT JOIN empresas e ON c.empresa_id = e.id
       WHERE c.id = $1
    `;
    const params = [id];

    // Si es admin de empresa, validar que sea su empresa
    if (!es_superadmin) {
      query += ` AND c.empresa_id = $2`;
      params.push(usuario_empresa_id);
    }

    const result = await client.query(query, params);
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Lead no encontrado'
      });
    }

    const lead = result.rows[0];

    // Obtener historial de cambios de estado
    const historialQuery = `SELECT * FROM historial_estado 
                           WHERE lead_id = $1 
                           ORDER BY fecha DESC`;
    const historialResult = await client.query(historialQuery, [id]);

    // Obtener notas
    const notasQuery = `SELECT n.*, u.nombre as usuario_nombre 
                       FROM notas_lead n 
                       LEFT JOIN usuarios u ON n.usuario_id = u.id 
                       WHERE n.lead_id = $1 
                       ORDER BY n.fecha DESC`;
    const notasResult = await client.query(notasQuery, [id]);

    // Obtener respuestas
    const respuestasQuery = `SELECT r.*, u.nombre as usuario_nombre 
                            FROM respuestas_leads r 
                            LEFT JOIN usuarios u ON r.usuario_id = u.id 
                            WHERE r.lead_id = $1 
                            ORDER BY r.fecha_creacion DESC`;
    const respuestasResult = await client.query(respuestasQuery, [id]);

    res.json({
      success: true,
      lead,
      historial: historialResult.rows,
      notas: notasResult.rows,
      respuestas: respuestasResult.rows
    });

  } catch (error) {
    console.error('Error en get lead detail:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener detalles del lead'
    });
  } finally {
    client.release();
  }
});

/**
 * PUT /api/dashboard/leads/:id/estado
 * Cambiar estado de un lead
 */
router.put('/leads/:id/estado', async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { estado, motivo } = req.body;
    const usuario_id = req.usuario?.id;
    const usuario_empresa_id = req.usuario?.empresa_id;
    const es_superadmin = req.usuario?.role === 'superadmin';

    // Estados permitidos
    const estadosPermitidos = ['recibido', 'contestado', 'prospecto', 'contactado', 'cliente', 'eliminado'];
    if (!estadosPermitidos.includes(estado)) {
      return res.status(400).json({
        success: false,
        error: 'Estado no válido'
      });
    }

    // Obtener estado anterior
    let leadQuery = 'SELECT estado, empresa_id FROM clientes WHERE id = $1';
    const leadParams = [id];
    
    if (!es_superadmin) {
      leadQuery += ' AND empresa_id = $2';
      leadParams.push(usuario_empresa_id);
    }

    const leadResult = await client.query(leadQuery, leadParams);
    if (leadResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Lead no encontrado'
      });
    }

    const estadoAnterior = leadResult.rows[0].estado;

    // Actualizar estado
    await client.query(
      `UPDATE clientes 
       SET estado = $1, 
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [estado, id]
    );

    // Registrar en historial
    await client.query(
      `INSERT INTO historial_estado (lead_id, estado_anterior, estado_nuevo, usuario_id, motivo) 
       VALUES ($1, $2, $3, $4, $5)`,
      [id, estadoAnterior, estado, usuario_id, motivo || null]
    );

    // Obtener datos actualizados
    const updatedQuery = `
      SELECT c.*, e.nombre as empresa_nombre
       FROM clientes c
       LEFT JOIN empresas e ON c.empresa_id = e.id
       WHERE c.id = $1
    `;
    const updatedResult = await client.query(updatedQuery, [id]);

    res.json({
      success: true,
      message: 'Estado actualizado correctamente',
      lead: updatedResult.rows[0]
    });

  } catch (error) {
    console.error('Error al cambiar estado:', error);
    res.status(500).json({
      success: false,
      error: 'Error al actualizar estado'
    });
  } finally {
    client.release();
  }
});

/**
 * POST /api/dashboard/leads/:id/responder
 * Responder a un lead vía email
 */
router.post('/leads/:id/responder', async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { respuesta_mensaje, enviar_email } = req.body;
    const usuario_id = req.usuario?.id;
    const usuario_empresa_id = req.usuario?.empresa_id;
    const es_superadmin = req.usuario?.role === 'superadmin';

    // Obtener datos del lead
    let leadQuery = 'SELECT * FROM clientes WHERE id = $1';
    const leadParams = [id];

    if (!es_superadmin) {
      leadQuery += ' AND empresa_id = $2';
      leadParams.push(usuario_empresa_id);
    }

    const leadResult = await client.query(leadQuery, leadParams);
    if (leadResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Lead no encontrado'
      });
    }

    const lead = leadResult.rows[0];
    let fecha_envio = null;

    // Si se debe enviar por email (implementar después con emailService)
    if (enviar_email) {
      fecha_envio = new Date();
      // TODO: Integrar con emailService para enviar email real
      console.log(`[EMAIL] Respuesta a ${lead.email}: ${respuesta_mensaje}`);
    }

    // Guardar respuesta en BD
    const insertQuery = `INSERT INTO respuestas_leads 
                        (lead_id, usuario_id, respuesta_mensaje, enviada_email, fecha_envio) 
                        VALUES ($1, $2, $3, $4, $5) 
                        RETURNING *`;
    const insertResult = await client.query(insertQuery, [
      id,
      usuario_id,
      respuesta_mensaje,
      enviar_email ? true : false,
      fecha_envio
    ]);

    res.json({
      success: true,
      respuesta: insertResult.rows[0],
      mensaje: enviar_email ? 'Respuesta enviada por email y guardada' : 'Respuesta guardada'
    });

  } catch (error) {
    console.error('Error en responder:', error);
    res.status(500).json({
      success: false,
      error: 'Error al responder'
    });
  } finally {
    client.release();
  }
});

/**
 * POST /api/dashboard/leads/:id/notas
 * Agregar nota a un lead
 */
router.post('/leads/:id/notas', async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { contenido } = req.body;
    const usuario_id = req.usuario?.id;
    const usuario_empresa_id = req.usuario?.empresa_id;
    const es_superadmin = req.usuario?.role === 'superadmin';

    // Validar que el lead exista
    let leadQuery = 'SELECT empresa_id FROM clientes WHERE id = $1';
    const leadParams = [id];

    if (!es_superadmin) {
      leadQuery += ' AND empresa_id = $2';
      leadParams.push(usuario_empresa_id);
    }

    const leadResult = await client.query(leadQuery, leadParams);
    if (leadResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Lead no encontrado'
      });
    }

    // Insertar nota
    const insertQuery = `INSERT INTO notas_lead (lead_id, usuario_id, contenido) 
                        VALUES ($1, $2, $3) 
                        RETURNING *`;
    const insertResult = await client.query(insertQuery, [id, usuario_id, contenido]);

    res.json({
      success: true,
      nota: insertResult.rows[0]
    });

  } catch (error) {
    console.error('Error en agregar nota:', error);
    res.status(500).json({
      success: false,
      error: 'Error al agregar nota'
    });
  } finally {
    client.release();
  }
});

/**
 * GET /api/dashboard/empresas
 * Listar todas las empresas (solo para superadmin)
 */
router.get('/empresas', async (req, res) => {
  const client = await pool.connect();
  try {
    const es_superadmin = req.usuario?.role === 'superadmin';

    // Solo superadmin puede ver todas las empresas
    if (!es_superadmin) {
      return res.status(403).json({
        success: false,
        error: 'Solo superadmin puede ver todas las empresas'
      });
    }

    const query = 'SELECT * FROM empresas ORDER BY nombre DESC';
    const result = await client.query(query);
    
    res.json({
      success: true,
      empresas: result.rows
    });

  } catch (error) {
    console.error('Error en empresas:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener empresas'
    });
  } finally {
    client.release();
  }
});

export default router;