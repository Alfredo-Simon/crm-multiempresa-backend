import express from 'express';
import pool from '../config/database.js';

const router = express.Router();

/**
 * GET /api/dashboard/stats
 * Obtener estadísticas generales
 */
router.get('/stats', async (req, res) => {
  try {
    const connection = await pool.getConnection();
    
    try {
      const usuario_empresa_id = req.user?.empresa_id;
      const es_admin = req.user?.role === 'admin';

      // Filtro por empresa si no es admin
      const whereClause = es_admin ? '' : `WHERE c.empresa_id = ${usuario_empresa_id}`;

      // 1. Total de leads
      const [totalLeads] = await connection.query(
        `SELECT COUNT(*) as total FROM clientes c ${whereClause}`
      );

      // 2. Leads por estado
      const [leadsPorEstado] = await connection.query(
        `SELECT estado, COUNT(*) as cantidad FROM clientes c ${whereClause} GROUP BY estado`
      );

      // 3. Leads por origen
      const [leadsPorOrigen] = await connection.query(
        `SELECT origen, COUNT(*) as cantidad FROM clientes c ${whereClause} GROUP BY origen`
      );

      // 4. Leads por fecha (últimos 30 días)
      const [leadsPorFecha] = await connection.query(
        `SELECT DATE(created_at) as fecha, COUNT(*) as cantidad 
         FROM clientes c ${whereClause} 
         AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
         GROUP BY DATE(created_at)
         ORDER BY fecha DESC`
      );

      res.json({
        success: true,
        stats: {
          totalLeads: totalLeads[0].total,
          porEstado: leadsPorEstado,
          porOrigen: leadsPorOrigen,
          porFecha: leadsPorFecha
        }
      });

    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Error en dashboard/stats:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener estadísticas'
    });
  }
});

/**
 * GET /api/dashboard/leads
 * Obtener lista de leads con filtros
 */
router.get('/leads', async (req, res) => {
  try {
    const connection = await pool.getConnection();
    
    try {
      const usuario_empresa_id = req.user?.empresa_id;
      const es_admin = req.user?.role === 'admin';
      const { estado, origen, empresa_id, pagina = 1, limite = 10 } = req.query;

      // Construir WHERE clause
      let where = [];
      
      if (!es_admin) {
        where.push(`c.empresa_id = ${usuario_empresa_id}`);
      } else if (empresa_id) {
        where.push(`c.empresa_id = ${empresa_id}`);
      }

      if (estado) {
        where.push(`c.estado = '${estado}'`);
      }

      if (origen) {
        where.push(`c.origen = '${origen}'`);
      }

      const whereSQL = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
      const offset = (pagina - 1) * limite;

      // Total de registros
      const [totalResult] = await connection.query(
        `SELECT COUNT(*) as total FROM clientes c ${whereSQL}`
      );
      const total = totalResult[0].total;

      // Leads con usuario que cambió estado
      const [leads] = await connection.query(
        `SELECT 
          c.id,
          c.nombre,
          c.apellidos,
          c.email,
          c.telefono,
          c.estado,
          c.origen,
          c.respuesta_mensaje,
          c.created_at,
          c.fecha_cambio_estado,
          u.nombre as usuario_cambio,
          e.nombre as empresa_nombre
         FROM clientes c
         LEFT JOIN usuarios u ON c.usuario_ultimo_cambio_id = u.id
         LEFT JOIN empresas e ON c.empresa_id = e.id
         ${whereSQL}
         ORDER BY c.created_at DESC
         LIMIT ? OFFSET ?`,
        [parseInt(limite), offset]
      );

      res.json({
        success: true,
        leads,
        paginacion: {
          total,
          pagina: parseInt(pagina),
          limite: parseInt(limite),
          totalPaginas: Math.ceil(total / limite)
        }
      });

    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Error en dashboard/leads:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener leads'
    });
  }
});

/**
 * PUT /api/dashboard/leads/:id/estado
 * Cambiar estado de un lead
 */
router.put('/leads/:id/estado', async (req, res) => {
  try {
    const connection = await pool.getConnection();
    
    try {
      const { id } = req.params;
      const { estado, respuesta_mensaje } = req.body;
      const usuario_id = req.user?.usuario_id;

      // Estados permitidos
      const estadosPermitidos = ['recibido', 'contestado'];
      if (!estadosPermitidos.includes(estado)) {
        return res.status(400).json({
          success: false,
          error: 'Estado no válido'
        });
      }

      // Actualizar
      await connection.query(
        `UPDATE clientes 
         SET estado = ?, 
             usuario_ultimo_cambio_id = ?,
             fecha_cambio_estado = NOW(),
             respuesta_mensaje = ?
         WHERE id = ?`,
        [estado, usuario_id, respuesta_mensaje || null, id]
      );

      // Obtener datos actualizados
      const [lead] = await connection.query(
        `SELECT c.*, u.nombre as usuario_cambio
         FROM clientes c
         LEFT JOIN usuarios u ON c.usuario_ultimo_cambio_id = u.id
         WHERE c.id = ?`,
        [id]
      );

      res.json({
        success: true,
        message: 'Estado actualizado',
        lead: lead[0]
      });

    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Error al cambiar estado:', error);
    res.status(500).json({
      success: false,
      error: 'Error al actualizar estado'
    });
  }
});

export default router;
