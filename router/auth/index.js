const jwt = require("jsonwebtoken")

// Middleware to validate token (rutas protegidas)
const isAuth = async (req, res, next) => {
    const token = req.cookies.jwt
    if (!token) return res.status(403).json({ auth: false })
    try {
        jwt.verify(token, process.env.TOKEN_SECRET)
        next()
    } catch (error) {
        res.status(400).json({ error: "Token de acceso no es válido" })
    }
}

module.exports = { isAuth }
