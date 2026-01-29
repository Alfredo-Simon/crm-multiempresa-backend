import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'tu-clave-secreta-change-in-production';

export const authMiddleware = (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ error: 'Token requerido' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token inválido' });
  }
};

export default authMiddleware;
