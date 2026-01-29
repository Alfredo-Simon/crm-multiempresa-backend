import express from 'express';
import pool from '../config/database.js';
import { autenticar } from './auth.js';

const router = express.Router();

// Aplicar autenticación a todas las rutas
router.use(autenticar);

/**
 * GET /api/clients
 * Obtener todos los clientes de la empresa del usuario
 */
router.get('/', async (req, res) => {
  const { estado, buscar, pagina = 1, limite = 50 } = req.query;
  const offset = (parseInt(pagina) - 1) * parseInt(limite);

  const client = await pool.connect();
  try {
    let sql = `
      SELECT c.* FROM clientes c 
      WHERE c.empresa_id = $1
    `;
    const params = [req.usuario.empresa_id];
    let paramIndex = 2;

    // Filtrar por estado si se proporciona
    if (estado) {
      sql += ` AND c.estado = $${paramIndex}`;
      params.push(estado);
      paramIndex++;
    }

    // Buscar por nombre, email o teléfono
    if (buscar) {
      const searchTerm = `%${buscar}%`;
      sql += ` AND (c.nombre ILIKE $${paramIndex} OR c.email ILIKE $${paramIndex + 1} OR c.telefono ILIKE $${paramIndex + 2})`;
      params.push(searchTerm, searchTerm, searchTerm);
      paramIndex += 3;
    }

    // Contar total
    const countSql = `SELECT COUNT(*) as total FROM clientes c WHERE c.empresa_id = $1`;
    const countParams = [req.usuario.empresa_id];
    let countParamIndex = 2;

    if (estado) {
      countSql += ` AND c.estado = $${countParamIndex}`;
      countParams.push(estado);
      countParamIndex++;
    }

    if (buscar) {
      const searchTerm = `%${buscar}%`;
      countSql += ` AND (c.nombre ILIKE $${countParamIndex} OR c.email ILIKE $${countParamIndex + 1} OR c.telefono ILIKE $${countParamIndex + 2})`;
      countParams.push(searchTerm, searchTerm, searchTerm);
    }

    const countResult = await client.query(countSql, countParams);
    const total = parseInt(countResult.rows[0].total);

    // Obtener datos con paginación
    sql += ` ORDER BY c.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limite), offset);

    const result = await client.query(sql, params);

    res.json({
      success: true,
      data: result.rows,
      paginacion: {
        pagina: parseInt(pagina),
        limite: parseInt(limite),
        total,
        totalPaginas: Math.ceil(total / parseInt(limite))
      }
    });

  } catch (error) {
    console.error('❌ Error obteniendo clientes:', error);
    res.status(500).json({ error: 'Error al obtener clientes' });
  } finally {
    client.release();
  }
});

/**
 * GET /api/clients/:id
 * Obtener un cliente específico
 */
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT * FROM clientes 
       WHERE id = $1 AND empresa_id = $2`,
      [id, req.usuario.empresa_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    // Obtener logs/historial del cliente
    const logsResult = await client.query(
      `SELECT * FROM logs_leads 
       WHERE cliente_id = $1 
       ORDER BY created_at DESC`,
      [id]
    );

    res.json({
      success: true,
      cliente: result.rows[0],
      historial: logsResult.rows
    });

  } catch (error) {
    res.status(500).json({ error: 'Error al obtener cliente' });
  } finally {
    client.release();
  }
});

/**
 * PUT /api/clients/:id
 * Actualizar un cliente
 */
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { nombre, apellidos, email, telefono, direccion, cup_numero, estado, notas } = req.body;

  const client = await pool.connect();
  try {
    // Verificar que el cliente existe y es de esta empresa
    const verificarResult = await client.query(
      'SELECT id FROM clientes WHERE id = $1 AND empresa_id = $2',
      [id, req.usuario.empresa_id]
    );

    if (verificarResult.rows.length === 0) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    // Actualizar
    await client.query(
      `UPDATE clientes 
       SET nombre = $1, apellidos = $2, email = $3, telefono = $4, 
           direccion = $5, cup_numero = $6, estado = $7, notas = $8,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $9 AND empresa_id = $10`,
      [nombre, apellidos, email, telefono, direccion, cup_numero, estado, notas, id, req.usuario.empresa_id]
    );

    // Registrar en logs
    await client.query(
      'INSERT INTO logs_leads (cliente_id, accion, detalles) VALUES ($1, $2, $3)',
      [id, 'cliente_actualizado', JSON.stringify({ por: req.usuario.usuario_id, cambios: req.body })]
    );

    res.json({ success: true, message: 'Cliente actualizado correctamente' });

  } catch (error) {
    console.error('❌ Error actualizando cliente:', error);
    res.status(500).json({ error: 'Error al actualizar cliente' });
  } finally {
    client.release();
  }
});

/**
 * DELETE /api/clients/:id
 * Eliminar un cliente (soft delete)
 */
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  const client = await pool.connect();
  try {
    const verificarResult = await client.query(
      'SELECT id FROM clientes WHERE id = $1 AND empresa_id = $2',
      [id, req.usuario.empresa_id]
    );

    if (verificarResult.rows.length === 0) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    // Cambiar estado a 'eliminado'
    await client.query(
      'UPDATE clientes SET estado = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      ['eliminado', id]
    );

    res.json({ success: true, message: 'Cliente eliminado' });

  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar cliente' });
  } finally {
    client.release();
  }
});

/**
 * GET /api/clients/estadisticas/resumen
 * Obtener resumen de estadísticas
 */
router.get('/estadisticas/resumen', async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN estado = 'prospecto' THEN 1 ELSE 0 END) as prospectos,
        SUM(CASE WHEN estado = 'contactado' THEN 1 ELSE 0 END) as contactados,
        SUM(CASE WHEN estado = 'cliente' THEN 1 ELSE 0 END) as clientes,
        SUM(CASE WHEN DATE(created_at) = CURRENT_DATE THEN 1 ELSE 0 END) as hoy
       FROM clientes 
       WHERE empresa_id = $1`,
      [req.usuario.empresa_id]
    );

    res.json({
      success: true,
      estadisticas: result.rows[0]
    });

  } catch (error) {
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  } finally {
    client.release();
  }
});

export default router;
