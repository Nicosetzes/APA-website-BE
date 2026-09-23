const express = require("express")
const cors = require("cors")
const helmet = require("helmet")

const { root, users, tournaments, statistics } = require("./router/router")
const { HttpError, notFound, errorHandler } = require("./middleware/httpErrors")
const { requestContext } = require("./middleware/requestContext")

const corsOrigins =
    process.env.NODE_ENV === "development"
        ? "http://localhost:3000"
        : ["https://apa-website-fe.vercel.app", "https://sitioapa.com.ar"]

const createApp = ({ ensureDatabase, getDatabaseStatus }) => {
    const app = express()

    app.set("trust proxy", 1)
    app.use(requestContext)
    app.use(helmet())
    app.use(express.json({ limit: "1mb" }))
    app.use(express.urlencoded({ extended: true, limit: "1mb" }))
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
                environment:
                    process.env.VERCEL_ENV || process.env.NODE_ENV || null,
                checks: {
                    mongodb: getDatabaseStatus().state,
                    database: null,
                },
            })
        }

        const database = getDatabaseStatus()
        const isReady = database.state === "connected"

        return res.status(isReady ? 200 : 503).json({
            status: isReady ? "ready" : "not_ready",
            environment: process.env.VERCEL_ENV || process.env.NODE_ENV || null,
            checks: {
                mongodb: database.state,
                database: database.name ?? null,
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

    app.use(notFound)
    app.use(errorHandler)

    return app
}

module.exports = { createApp }
