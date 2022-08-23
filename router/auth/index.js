// const { retrieveInvalidToken } = require("./../../service/service");

const jwt = require("jsonwebtoken");

// Middleware to validate token (rutas protegidas)
const isAuth = async (req, res, next) => {
  const token = req.cookies.jwt;
  if (!token) return res.status(403).json({ auth: false });
  try {
    jwt.verify(token, process.env.TOKEN_SECRET);
    // const invalidToken = await retrieveInvalidToken(token); // Busco por el token presentado en la colección de tokens inválidos //
    // if (!invalidToken)
    next();
  } catch (error) {
    res.status(400).json({ error: "Token de acceso no es válido" });
  }
};

module.exports = { isAuth };
