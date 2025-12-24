const jwt = require("jsonwebtoken")

const isAuth = async (req, res, next) => {
    const authHeader = req.headers.authorization

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res
            .status(403)
            .json({ auth: false, message: "No existe sesión activa" })
    }

    const token = authHeader.substring(7) // Removing 'Bearer ' prefix

    try {
        const data = jwt.verify(token, process.env.TOKEN_SECRET)
        req.user = {
            id: data.id,
            name: data.name,
        }
        return next()
    } catch (error) {
        return res.status(403).json({
            auth: false,
            message: "Sesión no válida, error en las credenciales",
        })
    }
}

module.exports = { isAuth }
