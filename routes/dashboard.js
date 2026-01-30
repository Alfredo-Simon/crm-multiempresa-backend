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
    const es_admin = req.usuario?.role === 'admin';

    // 1. Total de leads
    const totalLeadsQuery = es_admin 
      ? 'SELECT COUNT(*) as total FROM clientes'
      : 'SELECT COUNT(*) as total FROM clientes WHERE empresa_id = $1';
    const totalLeadsParams = es_admin ? [] : [usuario_empresa_id];
    const totalLeadsResult = await client.query(totalLeadsQuery, totalLeadsParams);

    // 2. Leads por estado
    const leadsPorEstadoQuery = es_admin
      ? 'SELECT estado, COUNT(*) as cantidad FROM clientes GROUP BY estado'
      : 'SELECT estado, COUNT(*) as cantidad FROM clientes WHERE empresa_id = $1 GROUP BY estado';
    const leadsPorEstadoParams = es_admin ? [] : [usuario_empresa_id];
    const leadsPorEstadoResult = await client.query(leadsPorEstadoQuery, leadsPorEstadoParams);

    // 3. Leads por origen
    const leadsPorOrigenQuery = es_admin
      ? 'SELECT origen, COUNT(*) as cantidad FROM clientes GROUP BY origen'
      : 'SELECT origen, COUNT(*) as cantidad FROM clientes WHERE empresa_id = $1 GROUP BY origen';
    const leadsPorOrigenParams = es_admin ? [] : [usuario_empresa_id];
    const leadsPorOrigenResult = await client.query(leadsPorOrigenQuery, leadsPorOrigenParams);

    // 4. Leads por fecha (últimos 30 días)
    const leadsPorFechaQuery = es_admin
      ? `SELECT DATE(created_at) as fecha, COUNT(*) as cantidad 
         FROM clientes 
         WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
         GROUP BY DATE(created_at)
         ORDER BY fecha DESC`
      : `SELECT DATE(created_at) as fecha, COUNT(*) as cantidad 
         FROM clientes 
         WHERE empresa_id = $1 AND created_at >= CURRENT_DATE - INTERVAL '30 days'
         GROUP BY DATE(created_at)
         ORDER BY fecha DESC`;
    const leadsPorFechaParams = es_admin ? [] : [usuario_empresa_id];
    const leadsPorFechaResult = await client.query(leadsPorFechaQuery, leadsPorFechaParams);

    res.json({
      success: true,
      stats: {
        totalLeads: totalLeadsResult.rows[0].total,
        porEstado: leadsPorEstadoResult.rows,
        porOrigen: leadsPorOrigenResult.rows,
        porFecha: leadsPorFechaResult.rows
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
 * Obtener lista de leads con filtros
 */
router.get('/leads', async (req, res) => {
  const client = await pool.connect();
  try {
    const usuario_empresa_id = req.usuario?.empresa_id;
    const es_admin = req.usuario?.role === 'admin';
    const { estado, origen, empresa_id, pagina = 1, limite = 10 } = req.query;

    // Construir WHERE clause dinámico
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (!es_admin) {
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

    // Leads con usuario que cambió estado - AGREGUÉ CAMPO mensaje
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
        u.nombre as usuario_cambio,
        e.nombre as empresa_nombre
       FROM clientes c
       LEFT JOIN usuarios u ON c.usuario_ultimo_cambio_id = u.id
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
 * PUT /api/dashboard/leads/:id/estado
 * Cambiar estado de un lead
 */
router.put('/leads/:id/estado', async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { estado, respuesta_mensaje } = req.body;
    const usuario_id = req.usuario?.usuario_id;

    // Estados permitidos
    const estadosPermitidos = ['recibido', 'contestado', 'prospecto', 'contactado', 'cliente', 'eliminado'];
    if (!estadosPermitidos.includes(estado)) {
      return res.status(400).json({
        success: false,
        error: 'Estado no válido'
      });
    }

    // Actualizar
    await client.query(
      `UPDATE clientes 
       SET estado = $1, 
           usuario_ultimo_cambio_id = $2,
           updated_at = CURRENT_TIMESTAMP,
           notas = $3
       WHERE id = $4`,
      [estado, usuario_id, respuesta_mensaje || null, id]
    );

    // Obtener datos actualizados
    const leadResult = await client.query(
      `SELECT c.*, u.nombre as usuario_cambio
       FROM clientes c
       LEFT JOIN usuarios u ON c.usuario_ultimo_cambio_id = u.id
       WHERE c.id = $1`,
      [id]
    );

    res.json({
      success: true,
      message: 'Estado actualizado',
      lead: leadResult.rows[0]
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

export default router;
