-- ===== CREAR BASE DE DATOS =====
CREATE DATABASE IF NOT EXISTS crm_multiempresa;
USE crm_multiempresa;

-- ===== INSERTAR EMPRESAS DE EJEMPLO =====
INSERT INTO empresas (nombre, email_notificaciones, activa) VALUES
('Empresa A - Energía Solar', 'admin@empresa-a.com', TRUE),
('Empresa B - Servicios', 'info@empresa-b.com', TRUE);

-- ===== INSERTAR USUARIOS DE EJEMPLO =====
-- Contraseñas: 
-- admin@empresa-a.com = password123
-- admin@empresa-b.com = password123

INSERT INTO usuarios (empresa_id, email, password_hash, nombre, role, activo) VALUES
(1, 'admin@empresa-a.com', '$2a$10$K2zJ8L5q8M4qJ3Q5R7T9Z.mL5K7qM9K2J5Q7S9Z.aL5K7Q9S1V3', 'Admin A', 'admin', TRUE),
(2, 'admin@empresa-b.com', '$2a$10$K2zJ8L5q8M4qJ3Q5R7T9Z.mL5K7qM9K2J5Q7S9Z.aL5K7Q9S1V3', 'Admin B', 'admin', TRUE),
(1, 'comercial@empresa-a.com', '$2a$10$K2zJ8L5q8M4qJ3Q5R7T9Z.mL5K7qM9K2J5Q7S9Z.aL5K7Q9S1V3', 'Comercial A', 'comercial', TRUE);

-- ===== INSERTAR FORMULARIOS DE LEADS =====
INSERT INTO formularios_leads (empresa_id, nombre, slug, activo) VALUES
(1, 'Formulario Leads Empresa A', 'empresa-a-leads', TRUE),
(1, 'Formulario Contacto Empresa A', 'empresa-a-contacto', TRUE),
(2, 'Formulario Leads Empresa B', 'empresa-b-leads', TRUE);

-- ===== INSERTAR CLIENTES DE EJEMPLO =====
INSERT INTO clientes (empresa_id, nombre, apellidos, email, telefono, direccion, cup_numero, origen, estado) VALUES
(1, 'Juan', 'García López', 'juan.garcia@example.com', '661234567', 'Calle Principal 123, Madrid', 'ES12345ABC', 'formulario_leads', 'prospecto'),
(1, 'María', 'Rodríguez Martínez', 'maria.rodri@example.com', '665432109', 'Avenida Central 456, Barcelona', 'ES67890DEF', 'formulario_leads', 'contactado'),
(1, 'Carlos', 'López Fernández', 'carlos.lopez@example.com', '669876543', 'Plaza Mayor 789, Valencia', 'ES11111GHI', 'formulario_leads', 'cliente'),
(2, 'Ana', 'Sánchez González', 'ana.sanchez@example.com', '664445555', 'Calle Secundaria 321, Bilbao', 'ES22222JKL', 'formulario_leads', 'prospecto'),
(2, 'David', 'Martínez Ruiz', 'david.martinez@example.com', '663336666', 'Paseo del Parque 654, Sevilla', 'ES33333MNO', 'formulario_leads', 'prospecto');

-- ===== VISTAS ÚTILES (opcional) =====
CREATE VIEW IF NOT EXISTS resumen_empresas AS
SELECT 
  e.id,
  e.nombre,
  COUNT(DISTINCT c.id) as total_clientes,
  SUM(CASE WHEN c.estado = 'prospecto' THEN 1 ELSE 0 END) as prospectos,
  SUM(CASE WHEN c.estado = 'contactado' THEN 1 ELSE 0 END) as contactados,
  SUM(CASE WHEN c.estado = 'cliente' THEN 1 ELSE 0 END) as clientes
FROM empresas e
LEFT JOIN clientes c ON e.id = c.empresa_id AND c.estado != 'eliminado'
GROUP BY e.id;

-- ===== NOTA IMPORTANTE =====
-- Los hashes de contraseña son ejemplos. Para generar nuevos:
-- Utiliza bcryptjs con 10 salts:
-- password: "password123"
-- Se recomienda generar nuevas contraseñas antes de producción
