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

/* -------------------- DATABASE -------------------- */

const mongoose = require("mongoose")

mongoose
    .connect(
        `mongodb://${process.env.MONGO_USER}:${process.env.MONGO_PASS}@cluster0-shard-00-00.i6ffr.mongodb.net:27017,cluster0-shard-00-01.i6ffr.mongodb.net:27017,cluster0-shard-00-02.i6ffr.mongodb.net:27017/myFirstDatabase?ssl=true&replicaSet=atlas-vzvty3-shard-0&authSource=admin&retryWrites=true&w=majority`
    )
    .then(() => console.log("Base de datos MongoDB conectada"))
    .catch((err) => console.log(err))

/* -------------------- ROUTER -------------------- */

const { root, users, tournaments, statistics } = require("./router/router.js")

app.get("/", (req, res) => {
    res.send("Express on Vercel")
})

app.use("/api", root)
app.use("/api/users", users)
app.use("/api/tournaments", tournaments)
app.use("/api/statistics", statistics)

// DEFINO RUTAS INEXISTENTES //

app.get("*", (req, res) => {
    res.send("No se halló la página")
})

const PORT = process.env.PORT || 5000

app.listen(PORT, () => console.log(`EXPRESS server listening on port ${PORT}`))

// Export the Express API

module.exports = app
