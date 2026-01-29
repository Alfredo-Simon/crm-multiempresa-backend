import pkg from 'pg';
import dotenv from 'dotenv';

const { Pool } = pkg;

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
});

// Crear tablas automáticamente
async function initializeDatabase() {
  const client = await pool.connect();
  try {
    console.log('🔧 Inicializando base de datos...');

    // Tabla de empresas
    await client.query(`
      CREATE TABLE IF NOT EXISTS empresas (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(255) NOT NULL,
        email_notificaciones VARCHAR(255),
        logo_url VARCHAR(255),
        activa BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tabla de usuarios
    await client.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id SERIAL PRIMARY KEY,
        empresa_id INT NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        nombre VARCHAR(255),
        role VARCHAR(50) DEFAULT 'gerente',
        activo BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE
      )
    `);

    // Crear índice para usuarios
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_usuarios_empresa_role 
      ON usuarios(empresa_id, role)
    `);

    // Tabla de leads/clientes
    await client.query(`
      CREATE TABLE IF NOT EXISTS clientes (
        id SERIAL PRIMARY KEY,
        empresa_id INT NOT NULL,
        nombre VARCHAR(255) NOT NULL,
        apellidos VARCHAR(255),
        email VARCHAR(255),
        telefono VARCHAR(20),
        direccion TEXT,
        cup_numero VARCHAR(50),
        origen VARCHAR(50),
        estado VARCHAR(50) DEFAULT 'prospecto',
        notas TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE
      )
    `);

    // Crear índices para clientes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_clientes_empresa_estado 
      ON clientes(empresa_id, estado)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_clientes_email 
      ON clientes(email)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_clientes_created_at 
      ON clientes(created_at)
    `);

    // Tabla de formularios por empresa
    await client.query(`
      CREATE TABLE IF NOT EXISTS formularios_leads (
        id SERIAL PRIMARY KEY,
        empresa_id INT NOT NULL,
        nombre VARCHAR(255),
        slug VARCHAR(100) UNIQUE NOT NULL,
        activo BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE
      )
    `);

    // Tabla de logs de leads
    await client.query(`
      CREATE TABLE IF NOT EXISTS logs_leads (
        id SERIAL PRIMARY KEY,
        cliente_id INT NOT NULL,
        accion VARCHAR(100),
        detalles JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
      )
    `);

    console.log('✅ Base de datos inicializada correctamente');
  } catch (error) {
    console.error('❌ Error inicializando BD:', error.message);
  } finally {
    client.release();
  }
}

// Ejecutar al iniciar
initializeDatabase().catch(console.error);

export default pool;
