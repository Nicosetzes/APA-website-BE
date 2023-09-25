const { retrieveUserById } = require("./../../service")

const getLogout = async (req, res) => {
    try {
        const { userId } = req
        const { nickname } = await retrieveUserById(userId)
        return res
            .clearCookie("access_token", {
                withCredentials: true,
                maxAge: 1000 * 60 * 60 * 6, // 6 horas //
                httpOnly: process.env.NODE_ENV === "production",
                /* Si el atributo sameSite NO es especificado, la cookie se guarda en el navegador SOLO en Firefox (no en Chrome, ni en Opera ni en Edge) */
                /* Cuando especifico "none", elimina las restricciones en los otros navegadores (sino se especifica "lax" por defecto) */
                sameSite: "none",
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
