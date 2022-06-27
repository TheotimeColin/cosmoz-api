
const sharp = require('sharp')
const QRCode = require('qrcode')
const shortid = require('shortid')
const axios = require('axios')
const fs = require('fs')
const AWS = require('aws-sdk')
const mime = require('mime')
const Entities = require('../entities')
const resolvePath = require("path")

const s3 = new AWS.S3({
    accessKeyId: process.env.S3_ID,
    secretAccessKey: process.env.S3_SECRET
})

exports.createMediaCollection = async function (file, params = {}, user = null) {
    return new Promise(async (resolve, reject) => {
        params = {
            size: 'default',
            path: 'library',
            direct: false,
            ...params
        }

        try {
            const SIZES = {
                profile: [
                    { id: 's', width: 100 },
                    { id: 'm', width: 500 }

                ],
                default: [
                    { id: 's', width: 400 },
                    { id: 'm', width: 1000 }
                ]
            }

            if (params.direct) {
                let path = resolvePath.join(resolvePath.resolve(), 'uploads/' + shortid.generate() + '.jpg')

                const download = await axios({ url: file, responseType: 'stream' })

                if (!download.statusText == 'OK') throw Error('failed-download')

                await download.data.pipe(fs.createWriteStream(path)).on('finish', () => resolve()).on('error', e => reject(e))

                let test = fs.readFileSync(path)

                file = { path }
            }

            let color = ''

            let medias = await Promise.all(SIZES[params.size].map(async size => {
                let data = {}
            
                let original = await sharp(file.path).metadata()
                let buffer = await sharp(file.path).resize(Math.min(original.width, size.width)).toBuffer()
                let metadata = await sharp(buffer).metadata()
                const { dominant } = await sharp(file.path).stats()
                
                if (dominant) color = `rgb(${dominant.r}, ${dominant.g}, ${dominant.b})`

                data.width = metadata.width
                data.height = metadata.height

                let prepend = params.path
                if (params.path == '$user') prepend = `users/${user._id}`

                let fileDirectory = `${prepend}/${shortid.generate()}-${size.id}.${mime.getExtension(file.mimetype)}`
                
                const src = await s3.putObject({
                    Bucket: process.env.S3_BUCKET, Key: fileDirectory, Body: buffer
                }).promise()

                data.id = fileDirectory
                data.src = `https://${process.env.S3_BUCKET}.s3.eu-west-3.amazonaws.com/${data.id}`

                if (file.path) fs.unlink(file.path, () => {})
                
                return  {
                    ...data,
                    size: size.id
                }
            }))

            let mediaCollection = await Entities.mediaCollection.model.create({
                medias, color
            }) 

            resolve(mediaCollection._id)
        } catch (e) {
            console.error(e)

            if (file.path) fs.unlink(file.path, () => {})

            reject (e)
        }
    })
}

exports.uploadQR = async function (value, path) {
    return new Promise(async (resolve, reject) => {
        let srcPath = `uploads/${shortid.generate()}.png`
        
        try {
            await QRCode.toFile(srcPath, value, {
                scale: 5,
                width: 1000
            })
            
            let buffer = await sharp(srcPath).toBuffer()

            const src = await s3.putObject({
                Bucket: process.env.S3_BUCKET, Key: path, Body: buffer
            }).promise()

            fs.unlink(srcPath, () => {})

            resolve(`https://${process.env.S3_BUCKET}.s3.eu-west-3.amazonaws.com/${path}`)
        } catch (e) {
            fs.unlink(srcPath, () => {})

            console.error(e)
            reject()
        }
    })
}