import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../config/database.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'tu-clave-secreta-change-in-production';

/**
 * POST /api/auth/register
 * Registrar nuevo usuario (solo admin puede crear usuarios)
 */
router.post('/register', async (req, res) => {
  const { email, password, nombre, empresa_id, role } = req.body;

  if (!email || !password || !nombre || !empresa_id) {
    return res.status(400).json({ error: 'Faltan campos requeridos' });
  }

  const client = await pool.connect();
  try {
    // Verificar que la empresa existe
    const empresaResult = await client.query(
      'SELECT id FROM empresas WHERE id = $1',
      [empresa_id]
    );

    if (empresaResult.rows.length === 0) {
      return res.status(400).json({ error: 'Empresa no encontrada' });
    }

    // Hash de contraseña
    const passwordHash = await bcrypt.hash(password, 10);

    // Crear usuario
    const result = await client.query(
      `INSERT INTO usuarios (email, password_hash, nombre, empresa_id, role) 
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [email, passwordHash, nombre, empresa_id, role || 'gerente']
    );

    res.status(201).json({
      success: true,
      message: 'Usuario creado correctamente',
      usuario_id: result.rows[0].id
    });

  } catch (error) {
    if (error.code === '23505') { // Unique violation
      return res.status(400).json({ error: 'El email ya está registrado' });
    }
    console.error('❌ Error en registro:', error);
    res.status(500).json({ error: 'Error al registrar usuario' });
  } finally {
    client.release();
  }
});

/**
 * POST /api/auth/login
 * Login de usuario
 */
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contraseña requeridos' });
  }

  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT u.*, e.nombre as empresa_nombre 
       FROM usuarios u 
       JOIN empresas e ON u.empresa_id = e.id 
       WHERE u.email = $1 AND u.activo = TRUE`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const usuario = result.rows[0];

    // Verificar contraseña
    const passwordValida = await bcrypt.compare(password, usuario.password_hash);
    if (!passwordValida) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    // Generar JWT
    const token = jwt.sign(
      {
        usuario_id: usuario.id,
        email: usuario.email,
        empresa_id: usuario.empresa_id,
        role: usuario.role
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        email: usuario.email,
        empresa_id: usuario.empresa_id,
        empresa_nombre: usuario.empresa_nombre,
        role: usuario.role
      }
    });

  } catch (error) {
    console.error('❌ Error en login:', error);
    res.status(500).json({ error: 'Error al iniciar sesión' });
  } finally {
    client.release();
  }
});

/**
 * GET /api/auth/me
 * Obtener datos del usuario autenticado
 */
router.get('/me', autenticar, async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT u.*, e.nombre as empresa_nombre 
       FROM usuarios u 
       JOIN empresas e ON u.empresa_id = e.id 
       WHERE u.id = $1`,
      [req.usuario.usuario_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const usuario = result.rows[0];
    res.json({
      id: usuario.id,
      nombre: usuario.nombre,
      email: usuario.email,
      empresa_id: usuario.empresa_id,
      empresa_nombre: usuario.empresa_nombre,
      role: usuario.role
    });
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener datos del usuario' });
  } finally {
    client.release();
  }
});

/**
 * POST /api/auth/logout
 * Logout (en realidad solo es para el frontend eliminar el token)
 */
router.post('/logout', (req, res) => {
  res.json({ success: true, message: 'Sesión cerrada' });
});

/**
 * Middleware de autenticación
 */
export function autenticar(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token no proporcionado' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.usuario = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Token inválido' });
  }
}

export default router;
