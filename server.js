/* -------------------- DOTENV -------------------- */

const dotenv = require("dotenv").config()

/* -------------------- SERVER -------------------- */

const express = require("express")
const cookieParser = require("cookie-parser")
const cors = require("cors")

const app = express()
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(express.static("public"))
app.use(cookieParser())
app.use(
    cors({
        origin:
            process.env.NODE_ENV == "development"
                ? "http://localhost:3000"
                : "https://apa-website-fe.vercel.app",
        credentials: true,
    })
) // IMPORTANTE: Tiene que ser así, intenté usar [] para permitir más de un dominio en production pero esta feature de CORS no fuciona en Vercel! //

const { homeR } = require("./router/router.js")

app.get("/", (req, res) => {
    res.send("Express on Vercel")
})

app.use("/api", homeR)

// DEFINO RUTAS INEXISTENTES //

app.get("*", (req, res) => {
    res.send("No se halló la página")
})

const PORT = process.env.PORT || 5000

app.listen(PORT, () => console.log(`EXPRESS server listening on port ${PORT}`))

// Export the Express API

module.exports = app
