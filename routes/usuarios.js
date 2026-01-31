import express from 'express';
import pool from '../config/database.js';
import { autenticar } from './auth.js';
import bcrypt from 'bcryptjs';

const router = express.Router();

// Aplicar autenticación a todas las rutas
router.use(autenticar);

// Middleware para validar que es superadmin
const esSuperadmin = (req, res, next) => {
  if (req.usuario?.role !== 'superadmin') {
    return res.status(403).json({
      success: false,
      error: 'Solo superadmin puede acceder a esta función'
    });
  }
  next();
};

/**
 * GET /api/usuarios
 * Listar todos los usuarios (solo superadmin)
 */
router.get('/', esSuperadmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const query = `SELECT u.id, u.nombre, u.email, u.role, u.activo, u.empresa_id, e.nombre as nombre_empresa 
                   FROM usuarios u 
                   LEFT JOIN empresas e ON u.empresa_id = e.id 
                   ORDER BY u.created_at DESC`;
    const result = await client.query(query);
    
    res.json({
      success: true,
      usuarios: result.rows
    });
  } catch (error) {
    console.error('Error en listar usuarios:', error);
    res.status(500).json({
      success: false,
      error: 'Error al listar usuarios'
    });
  } finally {
    client.release();
  }
});

/**
 * GET /api/usuarios/:id
 * Obtener un usuario específico
 */
router.get('/:id', esSuperadmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const query = `SELECT u.id, u.nombre, u.email, u.role, u.activo, u.empresa_id, e.nombre as nombre_empresa 
                   FROM usuarios u 
                   LEFT JOIN empresas e ON u.empresa_id = e.id 
                   WHERE u.id = $1`;
    const result = await client.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Usuario no encontrado'
      });
    }

    res.json({
      success: true,
      usuario: result.rows[0]
    });
  } catch (error) {
    console.error('Error en obtener usuario:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener usuario'
    });
  } finally {
    client.release();
  }
});

/**
 * POST /api/usuarios
 * Crear nuevo usuario
 */
router.post('/', esSuperadmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const { nombre, email, password, role, empresa_id } = req.body;

    // Validaciones
    if (!nombre || !email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Nombre, email y password son obligatorios'
      });
    }

    // Verificar que el email no exista
    const existsQuery = 'SELECT id FROM usuarios WHERE email = $1';
    const existsResult = await client.query(existsQuery, [email]);
    if (existsResult.rows.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'El email ya está registrado'
      });
    }

    // Hash de contraseña
    const hashedPassword = await bcrypt.hash(password, 10);

    // Crear usuario
    const insertQuery = `INSERT INTO usuarios 
                        (nombre, email, password, role, empresa_id, activo) 
                        VALUES ($1, $2, $3, $4, $5, true) 
                        RETURNING id, nombre, email, role, empresa_id, activo`;
    
    const result = await client.query(insertQuery, [
      nombre,
      email,
      hashedPassword,
      role || 'admin',
      empresa_id || null
    ]);

    // Obtener datos completos con nombre de empresa
    const usuarioCreado = result.rows[0];
    let nombre_empresa = null;
    if (usuarioCreado.empresa_id) {
      const empresaQuery = 'SELECT nombre FROM empresas WHERE id = $1';
      const empresaResult = await client.query(empresaQuery, [usuarioCreado.empresa_id]);
      if (empresaResult.rows.length > 0) {
        nombre_empresa = empresaResult.rows[0].nombre;
      }
    }

    res.status(201).json({
      success: true,
      usuario: {
        ...usuarioCreado,
        nombre_empresa
      }
    });
  } catch (error) {
    console.error('Error en crear usuario:', error);
    res.status(500).json({
      success: false,
      error: 'Error al crear usuario'
    });
  } finally {
    client.release();
  }
});

/**
 * PUT /api/usuarios/:id
 * Editar usuario
 */
router.put('/:id', esSuperadmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { nombre, email, password, role, empresa_id, activo } = req.body;

    // Obtener usuario actual
    const usuarioActualQuery = 'SELECT * FROM usuarios WHERE id = $1';
    const usuarioActualResult = await client.query(usuarioActualQuery, [id]);

    if (usuarioActualResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Usuario no encontrado'
      });
    }

    const usuarioActual = usuarioActualResult.rows[0];

    // Si cambia email, verificar que no exista otro con ese email
    if (email && email !== usuarioActual.email) {
      const existsQuery = 'SELECT id FROM usuarios WHERE email = $1 AND id != $2';
      const existsResult = await client.query(existsQuery, [email, id]);
      if (existsResult.rows.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'El email ya está registrado'
        });
      }
    }

    // Preparar datos a actualizar
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (nombre !== undefined) {
      updates.push(`nombre = $${paramIndex}`);
      values.push(nombre);
      paramIndex++;
    }

    if (email !== undefined) {
      updates.push(`email = $${paramIndex}`);
      values.push(email);
      paramIndex++;
    }

    if (password !== undefined && password !== '') {
      const hashedPassword = await bcrypt.hash(password, 10);
      updates.push(`password = $${paramIndex}`);
      values.push(hashedPassword);
      paramIndex++;
    }

    if (role !== undefined) {
      updates.push(`role = $${paramIndex}`);
      values.push(role);
      paramIndex++;
    }

    if (empresa_id !== undefined) {
      updates.push(`empresa_id = $${paramIndex}`);
      values.push(empresa_id || null);
      paramIndex++;
    }

    if (activo !== undefined) {
      updates.push(`activo = $${paramIndex}`);
      values.push(activo);
      paramIndex++;
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No hay datos para actualizar'
      });
    }

    // Agregar ID al final
    values.push(id);

    const updateQuery = `UPDATE usuarios 
                        SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP 
                        WHERE id = $${paramIndex} 
                        RETURNING id, nombre, email, role, empresa_id, activo`;

    const result = await client.query(updateQuery, values);

    // Obtener nombre de empresa
    const usuarioActualizado = result.rows[0];
    let nombre_empresa = null;
    if (usuarioActualizado.empresa_id) {
      const empresaQuery = 'SELECT nombre FROM empresas WHERE id = $1';
      const empresaResult = await client.query(empresaQuery, [usuarioActualizado.empresa_id]);
      if (empresaResult.rows.length > 0) {
        nombre_empresa = empresaResult.rows[0].nombre;
      }
    }

    res.json({
      success: true,
      usuario: {
        ...usuarioActualizado,
        nombre_empresa
      }
    });
  } catch (error) {
    console.error('Error en actualizar usuario:', error);
    res.status(500).json({
      success: false,
      error: 'Error al actualizar usuario'
    });
  } finally {
    client.release();
  }
});

/**
 * DELETE /api/usuarios/:id
 * Eliminar usuario
 */
router.delete('/:id', esSuperadmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;

    // No permitir eliminar superadmin a sí mismo
    if (req.usuario?.id === parseInt(id)) {
      return res.status(400).json({
        success: false,
        error: 'No puedes eliminar tu propia cuenta'
      });
    }

    // Verificar que existe
    const usuarioQuery = 'SELECT * FROM usuarios WHERE id = $1';
    const usuarioResult = await client.query(usuarioQuery, [id]);

    if (usuarioResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Usuario no encontrado'
      });
    }

    // Eliminar usuario
    const deleteQuery = 'DELETE FROM usuarios WHERE id = $1 RETURNING id';
    await client.query(deleteQuery, [id]);

    res.json({
      success: true,
      mensaje: 'Usuario eliminado correctamente',
      id
    });
  } catch (error) {
    console.error('Error en eliminar usuario:', error);
    res.status(500).json({
      success: false,
      error: 'Error al eliminar usuario'
    });
  } finally {
    client.release();
  }
});

export default router;