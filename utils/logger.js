const write = (level, event, fields = {}) => {
    if (process.env.LOG_LEVEL === "silent") return

    const entry = JSON.stringify({
        timestamp: new Date().toISOString(),
        level,
        event,
        ...fields,
    })

    if (level === "error") {
        console.error(entry)
        return
    }

    console.log(entry)
}

module.exports = {
    error: (event, fields) => write("error", event, fields),
    info: (event, fields) => write("info", event, fields),
    warn: (event, fields) => write("warn", event, fields),
}
