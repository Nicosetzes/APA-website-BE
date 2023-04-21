const { retrieveUserById } = require("./../../service")

const jwt = require("jsonwebtoken")

const getLogout = async (req, res) => {
    const token = req.cookies.jwt
    if (!token)
        return res
            .status(400)
            .send({ auth: false, message: "Primero debe iniciar sesión" }) // Revisar código de error //
    let decodedToken
    try {
        decodedToken = jwt.verify(token, process.env.TOKEN_SECRET)
    } catch (error) {
        res.status(400).send({
            auth: false,
            message: "Sesión no válida, error en las credenciales",
        })
    }
    const { id } = decodedToken
    try {
        const { nickname } = await retrieveUserById(id)
        return res
            .clearCookie("jwt", {
                withCredentials: true,
                maxAge: 1000 * 60 * 60 * 6, // 6 horas //
                sameSite: true, // Prueba, estando en true debería ser "strict" según la docu. Seteandolo en lax funciona en localhost, pero no en internet //
                httpOnly: process.env.NODE_ENV === "production",
                secure: process.env.NODE_ENV === "production",
            })
            .status(200)
            .send({
                auth: false,
                message: `${nickname}, su sesión ha sido cerrada con éxito`,
            })
    } catch (err) {
        return res.status(500).send({
            auth: false,
            message: `Error inesperado, intente más tarde`,
        }) // Revisar código de error //
    }
}

module.exports = getLogout
