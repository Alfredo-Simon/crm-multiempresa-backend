import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

let transporter;

// Configurar transporte de email según el proveedor
if (process.env.EMAIL_SERVICE === 'gmail') {
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD // App password si tienes 2FA
    }
  });
} else if (process.env.EMAIL_HOST) {
  // Para cualquier servidor SMTP (incluyendo Ionos)
  transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT || 587,
    secure: process.env.EMAIL_SECURE === 'true', // true para 465, false para otros
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD
    }
  });
}

/**
 * Enviar notificación cuando llega un nuevo lead
 */
export async function enviarNotificacionNuevoLead(empresa, cliente) {
  if (!transporter || !empresa.email_notificaciones) {
    console.log('⚠️ Email no configurado o no hay destinatario');
    return;
  }

  try {
    const asunto = `🎯 Nuevo Lead: ${cliente.nombre} ${cliente.apellidos || ''}`;
    
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; color: white; border-radius: 8px 8px 0 0;">
          <h2 style="margin: 0;">✨ Nuevo Lead Recibido</h2>
          <p style="margin: 5px 0 0 0; opacity: 0.9;">Empresa: ${empresa.nombre}</p>
        </div>
        
        <div style="padding: 20px; background: #f9f9f9; border: 1px solid #eee;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr style="border-bottom: 1px solid #ddd;">
              <td style="padding: 10px; font-weight: bold; width: 30%; color: #667eea;">Nombre:</td>
              <td style="padding: 10px;">${cliente.nombre} ${cliente.apellidos || ''}</td>
            </tr>
            ${cliente.email ? `
            <tr style="border-bottom: 1px solid #ddd;">
              <td style="padding: 10px; font-weight: bold; color: #667eea;">Email:</td>
              <td style="padding: 10px;"><a href="mailto:${cliente.email}">${cliente.email}</a></td>
            </tr>
            ` : ''}
            ${cliente.telefono ? `
            <tr style="border-bottom: 1px solid #ddd;">
              <td style="padding: 10px; font-weight: bold; color: #667eea;">Teléfono:</td>
              <td style="padding: 10px;"><a href="tel:${cliente.telefono}">${cliente.telefono}</a></td>
            </tr>
            ` : ''}
            ${cliente.direccion ? `
            <tr style="border-bottom: 1px solid #ddd;">
              <td style="padding: 10px; font-weight: bold; color: #667eea;">Dirección:</td>
              <td style="padding: 10px;">${cliente.direccion}</td>
            </tr>
            ` : ''}
            ${cliente.cup_numero ? `
            <tr style="border-bottom: 1px solid #ddd;">
              <td style="padding: 10px; font-weight: bold; color: #667eea;">CUP:</td>
              <td style="padding: 10px;">${cliente.cup_numero}</td>
            </tr>
            ` : ''}
            <tr>
              <td style="padding: 10px; font-weight: bold; color: #667eea;">Fecha:</td>
              <td style="padding: 10px;">${new Date(cliente.created_at).toLocaleString('es-ES')}</td>
            </tr>
          </table>
        </div>
        
        <div style="padding: 20px; background: #f0f4ff; border-top: 1px solid #ddd; text-align: center;">
          <a href="${process.env.FRONTEND_URL || 'https://tudominio.com'}/dashboard" 
             style="display: inline-block; padding: 10px 20px; background: #667eea; color: white; text-decoration: none; border-radius: 4px;">
            Ver en Dashboard
          </a>
        </div>
        
        <div style="padding: 15px; font-size: 12px; color: #999; text-align: center; border-top: 1px solid #eee;">
          <p>Este es un email automático. No responder a este correo.</p>
        </div>
      </div>
    `;

    await transporter.sendMail({
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: empresa.email_notificaciones,
      subject: asunto,
      html: htmlContent,
      text: `Nuevo Lead: ${cliente.nombre} ${cliente.apellidos || ''}\nTeléfono: ${cliente.telefono || 'N/A'}\nEmail: ${cliente.email || 'N/A'}`
    });

    console.log(`✅ Email enviado a ${empresa.email_notificaciones}`);
  } catch (error) {
    console.error('❌ Error enviando email:', error.message);
  }
}

/**
 * Enviar reportes diarios/semanales
 */
export async function enviarReporteLeads(empresa, clientes, periodo = 'diario') {
  if (!transporter || !empresa.email_notificaciones || clientes.length === 0) {
    return;
  }

  try {
    const filasHTML = clientes.map(c => `
      <tr style="border-bottom: 1px solid #ddd;">
        <td style="padding: 8px;">${c.nombre} ${c.apellidos || ''}</td>
        <td style="padding: 8px;">${c.email || '-'}</td>
        <td style="padding: 8px;">${c.telefono || '-'}</td>
        <td style="padding: 8px; text-align: center;">
          <span style="background: #dff0d8; padding: 4px 8px; border-radius: 3px; font-size: 12px;">
            ${c.estado}
          </span>
        </td>
      </tr>
    `).join('');

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; color: white; border-radius: 8px 8px 0 0;">
          <h2 style="margin: 0;">📊 Reporte ${periodo} de Leads</h2>
          <p style="margin: 5px 0 0 0; opacity: 0.9;">Empresa: ${empresa.nombre}</p>
        </div>
        
        <div style="padding: 20px; background: #f9f9f9;">
          <p>Se han registrado <strong>${clientes.length}</strong> nuevos leads en el período ${periodo}.</p>
          
          <table style="width: 100%; border-collapse: collapse; margin-top: 15px; background: white;">
            <thead>
              <tr style="background: #667eea; color: white;">
                <th style="padding: 10px; text-align: left;">Nombre</th>
                <th style="padding: 10px; text-align: left;">Email</th>
                <th style="padding: 10px; text-align: left;">Teléfono</th>
                <th style="padding: 10px; text-align: center;">Estado</th>
              </tr>
            </thead>
            <tbody>
              ${filasHTML}
            </tbody>
          </table>
        </div>
      </div>
    `;

    await transporter.sendMail({
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: empresa.email_notificaciones,
      subject: `📊 Reporte ${periodo} - Leads ${empresa.nombre}`,
      html: htmlContent
    });

    console.log(`✅ Reporte ${periodo} enviado`);
  } catch (error) {
    console.error(`❌ Error enviando reporte:`, error.message);
  }
}

export default transporter;
