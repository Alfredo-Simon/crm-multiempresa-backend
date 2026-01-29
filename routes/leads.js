import express from 'express';
import pool from '../config/database.js';
import { enviarNotificacionNuevoLead } from '../config/email.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

// Rate limiting para evitar spam: máximo 10 formularios por IP cada 15 minutos
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Demasiados formularios desde esta IP, intenta más tarde',
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * POST /api/public/leads/:slug
 * Recibir formulario de leads desde la web pública
 * Ejemplo: POST /api/public/leads/empresa-1
 */
router.post('/:slug', limiter, async (req, res) => {
  const { slug } = req.params;
  const { nombre, apellidos, email, telefono, direccion, cup_numero, ...datosAdicionales } = req.body;

  const client = await pool.connect();
  try {
    // Validar campos requeridos
    if (!nombre) {
      return res.status(400).json({ error: 'El nombre es requerido' });
    }

    // 1. Obtener la empresa por slug del formulario
    const formularioResult = await client.query(
      'SELECT empresa_id FROM formularios_leads WHERE slug = $1 AND activo = TRUE',
      [slug]
    );

    if (formularioResult.rows.length === 0) {
      return res.status(404).json({ error: 'Formulario no encontrado o inactivo' });
    }

    const empresa_id = formularioResult.rows[0].empresa_id;

    // 2. Obtener datos de la empresa
    const empresaResult = await client.query(
      'SELECT * FROM empresas WHERE id = $1 AND activa = TRUE',
      [empresa_id]
    );

    if (empresaResult.rows.length === 0) {
      return res.status(404).json({ error: 'Empresa no encontrada' });
    }

    const empresa = empresaResult.rows[0];

    // 3. Insertar el cliente
    const clienteResult = await client.query(
      `INSERT INTO clientes 
      (empresa_id, nombre, apellidos, email, telefono, direccion, cup_numero, origen, estado) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'formulario_leads', 'prospecto')
      RETURNING id`,
      [empresa_id, nombre, apellidos || null, email || null, telefono || null, direccion || null, cup_numero || null]
    );

    const cliente_id = clienteResult.rows[0].id;

    // 4. Registrar en logs
    await client.query(
      'INSERT INTO logs_leads (cliente_id, accion, detalles) VALUES ($1, $2, $3)',
      [cliente_id, 'lead_recibido', JSON.stringify({ 
        ip: req.ip, 
        userAgent: req.get('user-agent'),
        datosAdicionales 
      })]
    );

    // 5. Obtener datos completos del cliente
    const clienteFullResult = await client.query(
      'SELECT * FROM clientes WHERE id = $1',
      [cliente_id]
    );

    const cliente = clienteFullResult.rows[0];

    // 6. Enviar email de notificación (asincrónico, sin esperar)
    enviarNotificacionNuevoLead(empresa, cliente).catch(err => 
      console.error('Error enviando notificación:', err)
    );

    // Respuesta exitosa
    res.status(201).json({
      success: true,
      message: '✅ Datos recibidos correctamente',
      cliente_id: cliente_id,
      timestamp: new Date().toISOString()
    });

    console.log(`✅ Nuevo lead recibido para ${empresa.nombre} - ID: ${cliente_id}`);

  } catch (error) {
    console.error('❌ Error al guardar lead:', error);
    res.status(500).json({ error: 'Error al procesar el formulario' });
  } finally {
    client.release();
  }
});

/**
 * GET /api/public/test/:slug
 * Endpoint de prueba para verificar que funciona el formulario
 */
router.get('/test/:slug', async (req, res) => {
  const { slug } = req.params;

  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT * FROM formularios_leads WHERE slug = $1',
      [slug]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Formulario no encontrado' });
    }

    res.json({
      status: 'ok',
      formulario: result.rows[0],
      mensaje: 'Puedes enviar datos a este endpoint con POST'
    });
  } catch (error) {
    res.status(500).json({ error: 'Error al verificar formulario' });
  } finally {
    client.release();
  }
});

export default router;
