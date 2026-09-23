const express = require("express")
const cors = require("cors")

const {
    root,
    users,
    tournaments,
    statistics,
    summary,
} = require("./router/router")
const { HttpError, notFound, errorHandler } = require("./middleware/httpErrors")

const corsOrigins =
    process.env.NODE_ENV === "development"
        ? "http://localhost:3000"
        : ["https://apa-website-fe.vercel.app", "https://sitioapa.com.ar"]

const createApp = ({ ensureDatabase, getDatabaseStatus }) => {
    const app = express()

    app.use(express.json())
    app.use(express.urlencoded({ extended: true }))
    app.use(express.static("public"))
    app.use(cors({ origin: corsOrigins }))

    app.get("/", (req, res) => {
        res.send("Express on Vercel")
    })

    app.get("/health/live", (req, res) => {
        res.status(200).json({ status: "ok" })
    })

    app.get("/health/ready", async (req, res) => {
        try {
            await ensureDatabase()
        } catch (error) {
            return res.status(503).json({
                status: "not_ready",
                checks: {
                    mongodb: getDatabaseStatus().state,
                },
            })
        }

        const database = getDatabaseStatus()
        const isReady = database.state === "connected"

        return res.status(isReady ? 200 : 503).json({
            status: isReady ? "ready" : "not_ready",
            checks: {
                mongodb: database.state,
            },
        })
    })

    app.use("/api", async (req, res, next) => {
        try {
            await ensureDatabase()
            return next()
        } catch (cause) {
            return next(
                new HttpError(
                    503,
                    "DATABASE_UNAVAILABLE",
                    "Base de datos no disponible",
                    [],
                    { cause }
                )
            )
        }
    })

    app.use("/api", root)
    app.use("/api/users", users)
    app.use("/api/tournaments", tournaments)
    app.use("/api/statistics", statistics)
    app.use("/api/summary", summary)

    app.use(notFound)
    app.use(errorHandler)

    return app
}

module.exports = { createApp }
