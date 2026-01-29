import express from 'express';
import ExcelJS from 'exceljs';
import pool from '../config/database.js';
import { autenticar } from './auth.js';
import moment from 'moment';

const router = express.Router();

// Aplicar autenticación a todas las rutas
router.use(autenticar);

/**
 * GET /api/excel/clientes
 * Exportar todos los clientes a Excel
 */
router.get('/clientes', async (req, res) => {
  const { estado } = req.query;

  try {
    const connection = await pool.getConnection();
    try {
      // Obtener clientes
      let sql = `
        SELECT c.*, e.nombre as empresa 
        FROM clientes c 
        JOIN empresas e ON c.empresa_id = e.id 
        WHERE c.empresa_id = ? AND c.estado != 'eliminado'
      `;
      const params = [req.usuario.empresa_id];

      if (estado) {
        sql += ` AND c.estado = ?`;
        params.push(estado);
      }

      sql += ` ORDER BY c.created_at DESC`;

      const [clientes] = await connection.query(sql, params);

      // Crear libro Excel
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Clientes', {
        pageSetup: { paperSize: 9, orientation: 'landscape' }
      });

      // Configurar columnas
      worksheet.columns = [
        { header: 'ID', key: 'id', width: 8 },
        { header: 'Nombre', key: 'nombre', width: 20 },
        { header: 'Apellidos', key: 'apellidos', width: 20 },
        { header: 'Email', key: 'email', width: 25 },
        { header: 'Teléfono', key: 'telefono', width: 15 },
        { header: 'Dirección', key: 'direccion', width: 30 },
        { header: 'CUP', key: 'cup_numero', width: 15 },
        { header: 'Origen', key: 'origen', width: 15 },
        { header: 'Estado', key: 'estado', width: 12 },
        { header: 'Fecha de Registro', key: 'created_at', width: 18 }
      ];

      // Estilo de encabezado
      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF667eea' }
      };
      headerRow.alignment = { horizontal: 'center', vertical: 'center' };

      // Agregar datos
      clientes.forEach((cliente, index) => {
        const row = worksheet.addRow({
          id: cliente.id,
          nombre: cliente.nombre,
          apellidos: cliente.apellidos || '',
          email: cliente.email || '',
          telefono: cliente.telefono || '',
          direccion: cliente.direccion || '',
          cup_numero: cliente.cup_numero || '',
          origen: cliente.origen || '',
          estado: cliente.estado,
          created_at: moment(cliente.created_at).format('DD/MM/YYYY HH:mm')
        });

        // Alternar colores de fila
        if (index % 2 === 0) {
          row.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF5F5F5' }
          };
        }

        // Alinear centro
        row.alignment = { horizontal: 'center', vertical: 'center', wrapText: true };
      });

      // Agregar resumen
      const summaryRow = worksheet.addRow({});
      summaryRow.addCell(`Total: ${clientes.length}`, { bold: true });

      // Hacer el archivo descargable
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=clientes_${moment().format('YYYY-MM-DD')}.xlsx`);

      await workbook.xlsx.write(res);
      res.end();

      console.log(`✅ Reporte Excel exportado - ${clientes.length} clientes`);

    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('❌ Error exportando Excel:', error);
    res.status(500).json({ error: 'Error al generar Excel' });
  }
});

/**
 * GET /api/excel/prospectos
 * Exportar solo prospectos
 */
router.get('/prospectos', async (req, res) => {
  try {
    res.redirect(`/api/excel/clientes?estado=prospecto`);
  } catch (error) {
    res.status(500).json({ error: 'Error' });
  }
});

/**
 * GET /api/excel/reporte-diario
 * Reporte diario de leads
 */
router.get('/reporte-diario', async (req, res) => {
  try {
    const connection = await pool.getConnection();
    try {
      // Leads de hoy
      const [leadsHoy] = await connection.query(
        `SELECT COUNT(*) as total FROM clientes 
         WHERE empresa_id = ? AND DATE(created_at) = CURDATE()`,
        [req.usuario.empresa_id]
      );

      // Leads esta semana
      const [leadsSemanales] = await connection.query(
        `SELECT COUNT(*) as total FROM clientes 
         WHERE empresa_id = ? AND YEARWEEK(created_at) = YEARWEEK(CURDATE())`,
        [req.usuario.empresa_id]
      );

      // Leads este mes
      const [leadesMensuales] = await connection.query(
        `SELECT COUNT(*) as total FROM clientes 
         WHERE empresa_id = ? AND YEAR(created_at) = YEAR(CURDATE()) 
         AND MONTH(created_at) = MONTH(CURDATE())`,
        [req.usuario.empresa_id]
      );

      // Clientes por estado
      const [porEstado] = await connection.query(
        `SELECT estado, COUNT(*) as total FROM clientes 
         WHERE empresa_id = ? 
         GROUP BY estado`,
        [req.usuario.empresa_id]
      );

      // Crear workbook
      const workbook = new ExcelJS.Workbook();

      // Sheet 1: Resumen
      const wsResumen = workbook.addWorksheet('Resumen', { pageSetup: { paperSize: 9 } });
      wsResumen.columns = [
        { header: 'Métrica', key: 'metrica', width: 30 },
        { header: 'Valor', key: 'valor', width: 15 }
      ];

      const headerResumen = wsResumen.getRow(1);
      headerResumen.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerResumen.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF667eea' } };

      wsResumen.addRow({ metrica: 'Leads Hoy', valor: leadsHoy[0].total });
      wsResumen.addRow({ metrica: 'Leads Esta Semana', valor: leadsSemanales[0].total });
      wsResumen.addRow({ metrica: 'Leads Este Mes', valor: leadesMensuales[0].total });

      // Sheet 2: Por estado
      const wsEstado = workbook.addWorksheet('Por Estado');
      wsEstado.columns = [
        { header: 'Estado', key: 'estado', width: 20 },
        { header: 'Cantidad', key: 'total', width: 15 }
      ];

      const headerEstado = wsEstado.getRow(1);
      headerEstado.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerEstado.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF667eea' } };

      porEstado.forEach(item => {
        wsEstado.addRow(item);
      });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=reporte_diario_${moment().format('YYYY-MM-DD')}.xlsx`);

      await workbook.xlsx.write(res);
      res.end();

    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('❌ Error generando reporte:', error);
    res.status(500).json({ error: 'Error al generar reporte' });
  }
});

export default router;
