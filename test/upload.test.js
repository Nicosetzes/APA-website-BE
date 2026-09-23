process.env.LOG_LEVEL = "silent"

const assert = require("node:assert/strict")
const { once } = require("node:events")
const test = require("node:test")
const express = require("express")
const multer = require("multer")

const {
    DEFAULT_EDIT_UPLOAD_FOLDER,
    EDIT_UPLOAD_MAX_FILE_SIZE_BYTES,
    EDIT_UPLOAD_MAX_FILES,
    getEditUploadFolder,
} = require("../config/uploads")
const { editFileFilter, postEditsUpload } = require("../controller/postEdits")
const { errorHandler } = require("../middleware/httpErrors")
const { requestContext } = require("../middleware/requestContext")

const withServer = async (app, callback) => {
    const server = app.listen(0)
    await once(server, "listening")

    try {
        const address = server.address()
        await callback(`http://127.0.0.1:${address.port}`)
    } finally {
        server.close()
        await once(server, "close")
    }
}

const createUploadApp = () => {
    const app = express()
    const upload = multer({
        storage: multer.memoryStorage(),
        fileFilter: editFileFilter,
        limits: {
            fileSize: EDIT_UPLOAD_MAX_FILE_SIZE_BYTES,
            files: EDIT_UPLOAD_MAX_FILES,
        },
    })

    app.use(requestContext)
    app.post(
        "/upload",
        upload.array("image", EDIT_UPLOAD_MAX_FILES),
        (req, res) => {
            res.status(200).json({ count: req.files.length })
        }
    )
    app.use(errorHandler)

    return app
}

test("Cloudinary storage implements the Multer 2 storage contract", () => {
    assert.equal(typeof postEditsUpload.storage._handleFile, "function")
    assert.equal(typeof postEditsUpload.storage._removeFile, "function")
})

test("Multer 2 accepts supported edit images", async () => {
    await withServer(createUploadApp(), async (baseUrl) => {
        const form = new globalThis.FormData()
        form.append(
            "image",
            new globalThis.Blob(["image"], { type: "image/png" }),
            "edit.png"
        )

        const response = await globalThis.fetch(`${baseUrl}/upload`, {
            method: "POST",
            body: form,
        })

        assert.equal(response.status, 200)
        assert.deepEqual(await response.json(), { count: 1 })
    })
})

test("unsupported edit formats return 415", async () => {
    await withServer(createUploadApp(), async (baseUrl) => {
        const form = new globalThis.FormData()
        form.append(
            "image",
            new globalThis.Blob(["text"], { type: "text/plain" }),
            "edit.txt"
        )

        const response = await globalThis.fetch(`${baseUrl}/upload`, {
            method: "POST",
            body: form,
        })
        const body = await response.json()

        assert.equal(response.status, 415)
        assert.equal(body.error.code, "UNSUPPORTED_EDIT_FORMAT")
    })
})

test("files larger than 3 MB return 413", async () => {
    await withServer(createUploadApp(), async (baseUrl) => {
        const form = new globalThis.FormData()
        form.append(
            "image",
            new globalThis.Blob(
                [Buffer.alloc(EDIT_UPLOAD_MAX_FILE_SIZE_BYTES + 1)],
                {
                    type: "image/png",
                }
            ),
            "large.png"
        )

        const response = await globalThis.fetch(`${baseUrl}/upload`, {
            method: "POST",
            body: form,
        })
        const body = await response.json()

        assert.equal(response.status, 413)
        assert.equal(body.error.code, "FILE_TOO_LARGE")
    })
})

test("more than 10 files return 400", async () => {
    await withServer(createUploadApp(), async (baseUrl) => {
        const form = new globalThis.FormData()

        for (let index = 0; index <= EDIT_UPLOAD_MAX_FILES; index += 1) {
            form.append(
                "image",
                new globalThis.Blob(["image"], { type: "image/png" }),
                `edit-${index}.png`
            )
        }

        const response = await globalThis.fetch(`${baseUrl}/upload`, {
            method: "POST",
            body: form,
        })
        const body = await response.json()

        assert.equal(response.status, 400)
        assert.equal(body.error.code, "TOO_MANY_FILES")
    })
})

test("edit uploads default to the edits folder and can be moved per environment", (t) => {
    const originalFolder = process.env.CLOUDINARY_EDITS_FOLDER

    t.after(() => {
        if (originalFolder === undefined) {
            delete process.env.CLOUDINARY_EDITS_FOLDER
        } else {
            process.env.CLOUDINARY_EDITS_FOLDER = originalFolder
        }
    })

    delete process.env.CLOUDINARY_EDITS_FOLDER
    assert.equal(getEditUploadFolder(), DEFAULT_EDIT_UPLOAD_FOLDER)
    assert.equal(getEditUploadFolder(), "edits")

    process.env.CLOUDINARY_EDITS_FOLDER = "  edits-preview  "
    assert.equal(getEditUploadFolder(), "edits-preview")

    process.env.CLOUDINARY_EDITS_FOLDER = "   "
    assert.equal(getEditUploadFolder(), "edits")
})
