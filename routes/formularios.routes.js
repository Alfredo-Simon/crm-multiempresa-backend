import express from 'express';
import pool from '../config/database.js';
import enviarEmailNotificacionLead from '../services/emailService.js';

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

  try {
    const connection = await pool.getConnection();
    
    try {
      // 1. Encontrar el formulario por slug
      const [formularios] = await connection.query(
        'SELECT id, empresa_id FROM formularios_leads WHERE slug = ?',
        [slug]
      );

      if (formularios.length === 0) {
        return res.status(404).json({ 
          success: false,
          error: 'Formulario no encontrado' 
        });
      }

      const { id: formulario_id, empresa_id } = formularios[0];

      // 2. Verificar si el cliente ya existe
      const [clientesExistentes] = await connection.query(
        'SELECT id FROM clientes WHERE email = ? AND empresa_id = ?',
        [email, empresa_id]
      );

      let cliente_id;

      if (clientesExistentes.length > 0) {
        // Cliente existe, actualizar
        cliente_id = clientesExistentes[0].id;
        await connection.query(
          `UPDATE clientes 
           SET nombre = ?, apellidos = ?, telefono = ?, estado = 'contactado', updated_at = NOW()
           WHERE id = ?`,
          [nombre, apellidos, telefono, cliente_id]
        );
      } else {
        // Crear nuevo cliente
        const [resultado] = await connection.query(
          `INSERT INTO clientes (empresa_id, nombre, apellidos, email, telefono, origen, estado)
           VALUES (?, ?, ?, ?, ?, 'formulario_web', 'recibido')`,
          [empresa_id, nombre, apellidos, email, telefono]
        );
        cliente_id = resultado.insertId;
      }

      // 3. Registrar en logs del cliente
      await connection.query(
        `INSERT INTO logs_leads (cliente_id, accion, detalles)
         VALUES (?, 'formulario_enviado', ?)`,
        [cliente_id, JSON.stringify({ 
          mensaje, 
          formulario_id,
          fecha_envio: new Date().toISOString()
        })]
      );

      // 4. Obtener datos de la empresa
      const [empresas] = await connection.query(
        'SELECT nombre, email_notificaciones FROM empresas WHERE id = ?',
        [empresa_id]
      );

      const empresa_nombre = empresas[0]?.nombre;
      const email_empresa = empresas[0]?.email_notificaciones;

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
        const resultEmpresa = await enviarEmailNotificacionLead(email_empresa, datosLead);
        if (resultEmpresa.success) {
          emailsEnviados.push(`empresa (${email_empresa})`);
        }
      }

      res.json({
        success: true,
        message: 'Lead registrado correctamente',
        cliente_id,
        emailsEnviados
      });

    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Error en formularios/submit:', error);
    res.status(500).json({
      success: false,
      error: 'Error al procesar el formulario'
    });
  }
});

export default router;
