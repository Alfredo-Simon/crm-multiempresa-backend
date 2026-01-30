import express from 'express';
import pool from '../config/database.js';
import { enviarEmailNotificacionLead } from '../services/emailService.js';

const router = express.Router();

/**
 * POST /api/formularios/submit
 * Recibir y guardar leads desde formularios web públicos
 */
router.post('/submit', async (req, res) => {
  const { nombre, apellidos, email, telefono, mensaje, slug } = req.body;

  // Validar campos requeridos
  if (!nombre || !apellidos || !email || !telefono || !mensaje || !slug) {
    return res.status(400).json({ 
      success: false,
      error: 'Faltan campos requeridos' 
    });
  }

  const client = await pool.connect();
  try {
    // 1. Encontrar el formulario por slug
    const formularioResult = await client.query(
      'SELECT id, empresa_id FROM formularios_leads WHERE slug = $1',
      [slug]
    );

    if (formularioResult.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        error: 'Formulario no encontrado' 
      });
    }

    const { id: formulario_id, empresa_id } = formularioResult.rows[0];

    // 2. CAMBIO: Siempre crear un nuevo registro (no verificar si existe)
    // De esta forma todos los envíos del formulario quedan registrados como leads separados
    const nuevoClienteResult = await client.query(
      `INSERT INTO clientes (empresa_id, nombre, apellidos, email, telefono, mensaje, origen, estado)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [empresa_id, nombre, apellidos, email, telefono, mensaje, 'formulario_web', 'recibido']
    );
    const cliente_id = nuevoClienteResult.rows[0].id;

    // 3. Registrar en logs del cliente
    await client.query(
      `INSERT INTO logs_leads (cliente_id, accion, detalles)
       VALUES ($1, $2, $3)`,
      [cliente_id, 'formulario_enviado', JSON.stringify({ 
        mensaje, 
        formulario_id,
        fecha_envio: new Date().toISOString()
      })]
    );

    // 4. Obtener datos de la empresa
    const empresaResult = await client.query(
      'SELECT nombre, email_notificaciones FROM empresas WHERE id = $1',
      [empresa_id]
    );

    const empresa_nombre = empresaResult.rows[0]?.nombre;
    const email_empresa = empresaResult.rows[0]?.email_notificaciones;

    // 5. Preparar datos para email
    const datosLead = {
      nombre,
      apellidos,
      email,
      telefono,
      mensaje,
      origen: 'formulario_web',
      empresa_nombre
    };

    // 6. Enviar email SOLO a la empresa
    let emailsEnviados = [];

    if (email_empresa) {
      try {
        const resultEmpresa = await enviarEmailNotificacionLead(email_empresa, datosLead);
        if (resultEmpresa.success) {
          emailsEnviados.push(`empresa (${email_empresa})`);
        }
      } catch (emailError) {
        console.error('Error enviando email:', emailError);
        // No bloqueamos si el email falla
      }
    }

    res.json({
      success: true,
      message: 'Lead registrado correctamente',
      cliente_id,
      emailsEnviados
    });

  } catch (error) {
    console.error('Error en formularios/submit:', error);
    res.status(500).json({
      success: false,
      error: 'Error al procesar el formulario'
    });
  } finally {
    client.release();
  }
});

export default router;
