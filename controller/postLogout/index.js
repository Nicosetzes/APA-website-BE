const { retrieveUserById } = require("./../../service")

const jwt = require("jsonwebtoken")

const postLogout = async (req, res) => {
    const token = req.cookies.jwt
    if (!token)
        return res
            .status(400)
            .json({ auth: false, message: "Primero debe iniciar sesión" }) // Revisar código de error //
    let decodedToken
    try {
        decodedToken = jwt.verify(token, process.env.TOKEN_SECRET)
    } catch (error) {
        res.status(400).json({
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
                sameSite: "none",
                httpOnly: true,
                secure: process.env.NODE_ENV === "development" ? false : true,
            })
            .status(200)
            .json({ auth: false, message: `Adiós ${nickname}` })
    } catch (err) {
        return res.status(500).json({
            auth: false,
            message: `Error inesperado, intente más tarde`,
        }) // Revisar código de error //
    }
}

module.exports = postLogout
