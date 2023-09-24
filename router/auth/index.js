const jwt = require("jsonwebtoken")

// Middleware to validate token (rutas protegidas)
const isAuth = async (req, res, next) => {
    const token = req.cookies.access_token
    if (!token)
        return res
            .status(403)
            .json({ auth: false, message: "No existe sesión activa" })
    try {
        const data = jwt.verify(token, process.env.TOKEN_SECRET)
        req.userId = data.id
        req.userName = data.name
        // req.userRole = data.role;
        return next()
    } catch (error) {
        res.status(403).json({
            error: "Sesión no válida, error en las credenciales",
        })
    }
}

module.exports = { isAuth }
