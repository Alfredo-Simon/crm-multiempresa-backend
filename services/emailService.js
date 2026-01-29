import nodemailer from 'nodemailer';

// Configurar transporte de Gmail
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'ahoraluzmedia@gmail.com',
    pass: 'gfgg vaag tkks mmfq'
  }
});

/**
 * Enviar email de notificación cuando llega un lead
 */
export const enviarEmailNotificacionLead = async (emailDestino, datos) => {
  try {
    const { nombre, apellidos, email, telefono, mensaje, origen, empresa_nombre } = datos;

    const contenidoHTML = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #667eea;">📬 Nuevo Lead Recibido</h2>
        
        <div style="background: #f0f4ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #333;">Información del Contacto</h3>
          
          <p><strong>Nombre:</strong> ${nombre} ${apellidos}</p>
          <p><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
          <p><strong>Teléfono:</strong> <a href="tel:${telefono}">${telefono}</a></p>
          <p><strong>Origen:</strong> ${origen}</p>
          <p><strong>Empresa:</strong> ${empresa_nombre}</p>
        </div>

        <div style="background: #f9f9f9; padding: 15px; border-left: 4px solid #667eea; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #333;">Mensaje</h3>
          <p style="white-space: pre-wrap; color: #555;">${mensaje}</p>
        </div>

        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #999;">
          <p>Este es un email automático del CRM Multiempresa.<br>
          Haz clic en "Responder" para contactar directamente con el cliente.</p>
        </div>
      </div>
    `;

    const mailOptions = {
      from: 'ahoraluzmedia@gmail.com',
      to: emailDestino,
      replyTo: email,  // ← Cuando el admin responde, va al email del cliente
      subject: `📬 Nuevo Lead: ${nombre} ${apellidos}`,
      html: contenidoHTML
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Email enviado a ${emailDestino}:`, info.response);
    return { success: true, messageId: info.messageId };

  } catch (error) {
    console.error('❌ Error al enviar email:', error);
    return { success: false, error: error.message };
  }
};

export default enviarEmailNotificacionLead;
