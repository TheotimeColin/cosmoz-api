const mongoose = require('mongoose')
const shortid = require('shortid')
const sharp = require('sharp')
const fs = require('fs')
const mime = require('mime')
const { authenticate, accessCheck, fieldsCheck } = require('../utils/user')
const { createNotification } = require('../utils/notifications')
const { sendBulkMail } = require('../utils/mailing')
const moment = require('moment-timezone')
moment.tz.setDefault('Europe/Paris')

const Entities = require('../entities')

exports.getEntities = async function (req, res) {
    let errors = []
    let data = []

    req.query = Object.keys(req.query)[0] ? req.query : req.body

    try {
        let user = await authenticate(req.headers)
        let cancel = false
        let idQuery = req.query._id && typeof req.query._id !== 'object' && !req.query._id.includes('$in')
        let queryType = req.query.type
        let options = {
            limit: 1000,
            skip: 0,
            ...req.query.options
        }

        delete req.query.options

        console.log(`\n -- QUERY ${queryType} --\n`)
        
        let Entity = queryType ? Entities[queryType] : null
        let result = null

        if (!Entity) throw Error('entity-not-found')

        if (idQuery) {
            result = await Entity.model.find({ _id: req.query._id })

            if (!result[0]) throw Error('id-not-found')
        } else {
            let query = req.query
            delete query.type
            
            let parsed = parseQuery(query, user)
            result = cancel ? [] : await Entity.model.find(parsed.query, null, { ...options, ...parsed.options })
        }

        if (!result) throw Error('search-not-found')

        if (Array.isArray(result)) {
            result = result.filter(async r => await accessCheck('read', Entity, r, user))
        } else {
            let granted = await accessCheck('read', Entity, result, user) 
            if (!granted) throw Error('unauthorized')
        }

        result = await Promise.all(result.map(async v => fieldsCheck('read', v._doc, Entity, v, user)))

        data = typeGetters[queryType] ? await typeGetters[queryType](result, user) : result

        postGet[queryType] ? await postGet[queryType](data, req.query, user) : {}

        if (idQuery) data = data[0]
    } catch (e) {
        console.error(e)
        errors.push(e.message)
    }
    
    res.send({
        data, errors,
        status: errors.length > 0 ? 0 : 1
    })
}

exports.createEntity = async function (req, res) {
    let errors = []
    let data = {}

    try { 
        let user = await authenticate(req.headers)
        let params = req.body.params ? req.body.params : {}
        let fields = params

        let Entity = req.body.type ? Entities[req.body.type] : null
        if (!Entity) throw Error('no-entity-type')

        console.log(`\n -- UPDATE ${req.body.type} --\n`)

        let result = req.body._id ? await Entity.model.findById(req.body._id) : null

        let granted = await accessCheck('write', Entity, result, user, fields)
        if (!granted) throw Error('unauthorized')

        fields = result ? await fieldsCheck('write', fields, Entity, result, user) : fields
        delete fields._id

        if (typeSetters[req.body.type]) fields = await typeSetters[req.body.type](fields, req, user, result)

        fields = parseQuery(fields, user)

        if (Entity.unique && fields.query[Entity.unique]) {
            let params = [ Entity.unique, ...Entity.uniqueConditions].reduce((params, key) => {
                if (!fields.query[key]) throw Error('missingDuplicateParameter')

                return { ...params, [key]: fields.query[key] }
            }, {})
            
            let duplicate = await Entity.model.findOne(params)
            if (duplicate && (!result || !duplicate._id.equals(result._id))) throw Error('duplicateFound')
        }

        console.log(fields)

        if (result) {
            data = await Entity.model.findOneAndUpdate({ _id: req.body._id }, fields.query)
        } else {
            data = await Entity.model.create(fields.query)
        }

        if (!data) throw Error('error')

        data = await Entity.model.find({ _id: data._id })
        if (typeCallbacks[req.body.type]) typeCallbacks[req.body.type](data[0]._doc, fields.query, user, result)

        data = await fieldsCheck('read', data[0]._doc, Entity, data[0], user)
    } catch (e) {
        console.warn(e)
        console.warn(e)
        errors.push(e.message)
    }

    res.send({
        data, errors,
        status: errors.length > 0 ? 0 : 1
    })
}

exports.deleteEntity = async function (req, res) {
    let errors = []

    try {
        let user = await authenticate(req.headers)

        if (!req.query._id) throw Error('no-id-supplied')
    
        let Entity = req.query.type ? Entities[req.query.type] : null
        if (!Entity) throw Error('no-entity-type')

        let result = await Entity.model.findById(req.query._id)

        let granted = await accessCheck('write', Entity, result, user)
        if (!granted) throw Error('unauthorized')

        if ((!result.owner || !result.owner.equals(user._id)) && !user.role == 'admin') throw Error('not-owner')

        if (typeDeleters[req.query.type]) await typeDeleters[req.query.type](result, user)

        await result.remove()
    } catch (e) {
        console.error(e)
        errors.push(e.message)
    }

    res.send({
        errors, status: errors.length > 0 ? 0 : 1
    })
}

const typeGetters = {
    gathering: async (data, user) => {
        return new Promise(async (resolve, reject) => {
            try {
                resolve(data)
            } catch (e) {
                reject (e)
            }
        })
    },
    constellation: async (data, user) => {
        return new Promise(async (resolve, reject) => {
            try {
                data = Promise.all(data.map(async c => {
                    let lastPosts = 0
                    let lastEvents = 0

                    if (user) {
                        let constellationData = user.constellationData[c._id]
                        
                        lastPosts = await Entities.status.model.count({
                            constellation: c._id,
                            parent: null,
                            createdAt: { $gte: constellationData?.lastVisitPosts ? constellationData.lastVisitPosts : moment().subtract(1, 'weeks').toDate() }
                        })

                        lastEvents = await Entities.gathering.model.count({
                            constellation: c._id,
                            status: 'active',
                            createdAt: { $gte: constellationData?.lastVisitEvents ? constellationData.lastVisitEvents : moment().subtract(1, 'weeks').toDate() }
                        })
                    }
                    

                    return { ...c, lastPosts, lastEvents }
                }))

                resolve(data)
            } catch (e) {
                reject (data)
            }
        })
    }
}

const typeSetters = {
    mediaCollection: async (params, req, user) => {
        return new Promise(async (resolve, reject) => {
            let file = req.file

            if (file) {
                params = JSON.parse(params)

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

                    let medias = await Promise.all(SIZES[params.size ? params.size : 'default'].map(async size => {
                        let original = await sharp(file.path).metadata()
                        let buffer = await sharp(file.path).resize(Math.min(original.width, size.width)).toBuffer()
                        let metadata = await sharp(buffer).metadata()
                        
                        let prepend = 'library'
                        if (params.path) prepend = params.path.includes('$user') ? params.path.replace('$user', `users/${user._id}`) : params.path

                        let fileDirectory = `${prepend}/${shortid.generate()}-${size.id}.${mime.getExtension(file.mimetype)}`
                        
                        const src = await new Promise(resolve => {
                            req.app.locals.s3.putObject({
                                Bucket: process.env.S3_BUCKET, Key: fileDirectory, Body: buffer
                            }, (err, data) => {
                                if (err) console.error(err)
                                
                                resolve(`https://${process.env.S3_BUCKET}.s3.eu-west-3.amazonaws.com/${fileDirectory}`)
                            })
                        })

                        fs.unlink(file.path, () => {})
                        return {
                            id: fileDirectory,
                            width: metadata.width,
                            height: metadata.height,
                            size: size.id,
                            src: src
                        }
                    }))

                    resolve({ ...params, medias })
                } catch (e) {
                    fs.unlink(file.path, () => {})
                    reject (e)
                }
            }

            resolve(params)
        })
    },
    user: async (params, req, user, doc) => {
        return new Promise(async resolve => {
            try {
                if (req.body.params.id && req.body.params.id != user.id) {
                    let newId = req.body.params.id

                    const existing = await Entities.user.model.findOne({
                        id: new RegExp(`^${newId}$`, 'i')
                    })
                    
                    if (!existing && newId.length >= 3 && newId.length <= 30 && /^[0-9a-zA-Z\.]*$/.test(newId)) {
                        params.id = newId
                    } else {
                        delete params.id
                    }
                }
    
                resolve(params)
            } catch (e) {
                console.error(e)
                resolve(params)
            }
        })
    },
    gathering: async (params, req, user, doc) => {
        return new Promise(async (resolve, reject) => {
            if (!doc || !doc.id) params.id = shortid.generate()

            params.organizers.forEach(orga => {
                if (!(doc ? doc.users : []).find(u => u._id.equals(orga))) params.users = [ ...(doc ? doc.users : []), { _id: mongoose.Types.ObjectId(orga), status: 'attending' } ]
            })
            
            resolve(params)
        })
    },
    product: async (params) => {
        return new Promise(async (resolve, reject) => {
            try {
                let variations = await Promise.all(params.variations.map(async variation => {
                    let Entity = Entities['productVariation']

                    let item = null
                    let result = variation._id ? await Entity.model.findById(variation._id) : null

                    if (result) {
                        item = await Entity.model.findByIdAndUpdate(variation._id, variation)
                    } else {
                        item = await Entity.model.create(variation)
                    }
                    
                    return item ? item._id : null
                }))

                resolve({ ...params, variations })
            } catch (e) {
                reject (e)
            }
        })
    },
}

const postGet = {
    status: async (data, query, user) => {
        return new Promise(async (resolve, reject) => {
            try {
                if (query.$updateUser && query.constellation) {
                    user.constellationData = {
                        ...user.constellationData,
                        [query.constellation]: {
                            ...(user.constellationData[query.constellation] ? user.constellationData[query.constellation] : {}),
                            lastVisitPosts: new Date()
                        }
                    }

                    await user.save()
                }

                resolve(data)
            } catch (e) {
                console.warn(e)
                resolve(data)
            }
        })
    }
}

const typeCallbacks = {
    user: async (data, query, user, previous) => {
        return new Promise(async (resolve, reject) => {
            try {
                resolve(data)
            } catch (e) {
                console.warn(e)
                resolve(data)
            }
        })
    },
    gathering: async (data, query, user, previous) => {
        return new Promise(async (resolve, reject) => {
            try {
                if (!previous || data.status != previous.status) {
                    const constellation = await Entities.constellation.model.findById(data.constellation)   
                    
                    if (data.status == 'active') {
                        await Promise.all(constellation.members.map(async member => {
                            return await createNotification({
                                type: 'gathering-new',
                                gathering: data._id,
                                constellation: constellation._id,
                                query: ['constellation'],
                                originator: {
                                    _id: data._id, type: 'gathering'
                                },
                                owner: member
                            }, user)
                        }))
                    }
                    
                    if (!constellation.gatherings.includes(data._id)) {
                        constellation.gatherings = [
                            ...constellation.gatherings,
                            data._id
                        ]

                        if (data.status == 'active') constellation.lastEvent = new Date()
                        
                        await constellation.save()
                    }
                }

                resolve(data)
            } catch (e) {
                console.warn(e)
                resolve(data)
            }
        })
    }
}

const typeDeleters = {
    gathering: async (data, user) => {
        return new Promise(async (resolve, reject) => {
            try {
                if (data.status == 'active' && moment(data.date).isAfter(moment())) {
                    let users = data.users.filter(u => u.status == 'attending').map(u => u._id)
        
                    users = await Entities.user.model.find({ _id: { $in: users }})
                    
                    const constellation = await Entities.constellation.model.findById(data.constellation)

                    try {
                        await Entities.notification.model.deleteMany({
                            gathering: data._id
                        })

                        await Promise.all(users.map(async u => {
                            return await createNotification({
                                type: 'gathering-cancelled',
                                constellation: constellation._id,
                                content: data.title,
                                originator: {
                                    _id: constellation._id, type: 'constellation'
                                },
                                owner: u._id
                            }, user)
                        }))
                    } catch (e) {
                        console.error(e)
                    }

                    try {
                        await sendBulkMail(users.map(user => ({
                            to: [ { email: user.email } ],
                        })), {
                            template: 5,
                            params: {
                                name: data.title,
                                constellation: constellation.name,
                                link: process.env.BASE_URL + '/c/' + constellation.slug + '/events'
                            }
                        })
                    } catch (e) {
                        console.error('bulk-mail-fail')
                        console.error(e)
                    }
                }

                resolve(data)
            } catch (e) {
                console.warn(e)
                resolve(data)
            }
        })
    }
}

const parseQuery = function (query, user) {
    let parsedQuery = { ...query }
    let options = {}

    Object.keys(query).forEach((key, value) => {
        value = query[key]
        
        if (key.startsWith('$or')) {
            if (value) {
                let fieldName = key.replace('$or', '').toLowerCase()

                value = value.split(',').map(v => ({
                    [fieldName]: v
                }))

                parsedQuery.$or = value
            }

            delete parsedQuery[key]
        }

        if (value == '$self') {
            if (user) {
                parsedQuery[key] = user._id
            } else {
                cancel = true
            }
        }

        if (key == '$updateUser') delete parsedQuery.$updateUser

        if (value && (typeof value === 'object' && !Array.isArray(value))) {
            let entries = Object.entries(value)

            if (entries[0]) {
                entries = entries[0]
                
                if (entries[0] == '$addToSet') {    
                    parsedQuery['$addToSet'] = { [key]: entries[1] }
                    delete parsedQuery[key]
                } else if (entries[0] == '$pull') {
                    parsedQuery['$pull'] = { [key]: entries[1] }
                    delete parsedQuery[key]
                } else if (entries[0] == '$in') {
                    parsedQuery[key] = { '$in': entries[1] }
                } else if (entries[0] == '$broad') {
                    parsedQuery[key] = new RegExp(`^${entries[1]}$`, 'i')
                } else if (entries[0] == '$includes') {
                    parsedQuery[key] = new RegExp(entries[1], 'i')
                }
            }
        }

        if (typeof value === 'string' && value == '$null') {
            parsedQuery[key] = null
        } else if (typeof value === 'string' && value == '$inc') {
            parsedQuery['$inc'] = { [key]: 1 }
            delete parsedQuery[key]
        } else if (typeof value === 'string' && value.startsWith('$in')) {
            parsedQuery[key] = { '$in': value.replace('$in', '').split(',') }
        }
    })

    if (query['$sort']) {
        options.sort = { [query['$sort']]: query['$sortValue'] }

        delete parsedQuery['$sort']
        delete parsedQuery['$sortValue']
    }

    if (query['$limit']) {
        options.limit = parseInt(query['$limit'])

        delete parsedQuery['$limit']
    }

    return { query: parsedQuery, options }
}