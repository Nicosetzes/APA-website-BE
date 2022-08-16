const jwt = require("jsonwebtoken");

// Middleware to validate token (rutas protegidas)
const isAuth = (req, res, next) => {
  const token = req.cookies.jwt;
  if (!token) return res.status(403).json({ auth: false });
  try {
    jwt.verify(token, process.env.TOKEN_SECRET);
    // req.userId = data.id;
    // req.userEmail = data.name;
    // console.log(userId);
    // req.userRole = data.role; // A futuro, para definir roles //
    next();
  } catch (error) {
    res.status(400).json({ error: "Token de acceso no es válido" });
  }
};

module.exports = { isAuth };
