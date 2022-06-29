const Entities = require('../entities')
const moment = require('moment-timezone')
moment.tz.setDefault('Europe/Paris')
const striptags  = require('striptags')

const { authenticate, accessCheck, fieldsCheck } = require('../utils/user')
const { createMediaCollection } = require('../utils/files')
const { createNotification } = require('../utils/notifications')

exports.postStatus = async function (req, res) {
    let data = {}
    let errors = []

    try {
        let fields = {
            ...req.body
        }

        let parent = null
        let constellation = null
        let gathering = null

        if ((!fields.content || !striptags(fields.content)) && (!req.files || req.files.length == 0)) throw Error('no-content')

        let user = await authenticate(req.headers)
        if (!user) throw Error('no-user')

        if (fields.gathering) {
            gathering = await Entities.gathering.model.findById(fields.gathering)

            if (!gathering) throw Error('no-gathering')

            // further checks
        }

        if (fields.constellation) {
            constellation = await Entities.constellation.model.findById(fields.constellation)

            if (!constellation) throw Error('no-constellation')
            if (!constellation.members.includes(user._id) && !constellation.admins.includes(user._id) && !constellation.organizers.includes(user._id) ) throw Error('not-authorized')
        }

        if (req.files) {
            let images = await Promise.all(req.files.map(async f => {
                try {
                    return await createMediaCollection(f, {
                        path: constellation ? `constellation/${constellation._id}/posts` : `users/${user._id}/posts`
                    })
                } catch (e) {
                    console.error(e)
                    throw Error('image-fail')
                }
            }))

            if (images && images.filter(i => i).length > 0) {
                fields.images = images.filter(i => i)
            }
        }

        if (fields.parent) {
            parent = await Entities.status.model.find({ _id: fields.parent })

            if (!parent[0]) throw Error('no-parent')
            
            if (!parent[0].owner.equals(user._id)) {
                try {
                    let notification = await createNotification({
                        type: 'post-reply',
                        status: parent[0]._id,
                        constellation: parent[0].constellation,
                        owner: parent[0].owner
                    }, user)

                    if (!notification) throw Error('notif-failed')
                } catch (e) {
                    console.error(e)
                }
            }
        }

        fields.content = striptags(fields.content)
        fields.content = fields.content.replace(/\n/g, '<br>')

        data = await Entities.status.model.create({
            ...fields,
            owner: user._id
        })

        let parentData = null
        if (parent && parent[0]) {
            let result = [ ...parent[0].children, data ]
            parent[0].children = result.map(c => c._id)

            await parent[0].save()

            parentData = await Entities.status.model.findOne({ _id: parent[0]._id })
        }

        // CALLBACKS

        if (fields.gathering && gathering && !fields.parent) {
            try {
                await Promise.all(gathering.users.filter(u => !user._id.equals(u._id) && (u.status == 'attending' || u.status == 'confirmed')).map(async u => {
                    return await createNotification({
                        type: 'post-gathering',
                        gathering: gathering._id,
                        owner: u._id
                    }, user)
                }))
            } catch (e) {
                console.error(e)
            }
        }

        data = await Entities.status.model.findOne({ _id: data._id })

        if (parentData) {
            let origin = parentData

            if (origin && !origin._id.equals(data.origin)) {
                origin = await Entities.status.model.findOne({ _id: data.origin })
            }

            data = { ...data._doc, parent: parentData._doc, origin: origin._doc }
            data = await fieldsCheck('read', data, Entities.status, data, user)
        } else {
            data = await fieldsCheck('read', data._doc, Entities.status, data, user)
        }
    } catch (e) {
        console.error(e)
        errors.push(e.message)
    }

    res.send({ data, errors, status: errors.length > 0 ? 0 : 1 })
}

exports.reactStatus = async function (req, res) {
    let data = {}
    let errors = []

    try {
        let fields = req.body

        if (!fields.type || !fields._id) throw Error('missing-fields')

        let user = await authenticate(req.headers)
        if (!user) throw Error('no-user')

        let status = await Entities.status.model.findOne({
            _id: fields._id
        })

        if (!status) throw Error('no-status')

        if (req.body.action) {
            let reaction = await Entities.reaction.model.create({
                type: req.body.type,
                owner: user._id,
                status: status._id
            })

            status.reactions = [ ...status.reactions, reaction._id ]
        } else {
            let reaction = await Entities.reaction.model.findOne({
                type: req.body.type,
                owner: user._id,
                status: status._id
            })
            
            status.reactions = status.reactions.filter(r => !r._id.equals(reaction._id))

            await reaction.remove()
        }

        let updated = await Entities.status.model.find({ _id: { $in: [fields._id, status.parent, status.origin] } })
        
        data = updated.find(d => d._id.equals(fields._id))

        if (status.parent) data.parent = updated.find(d => d._id.equals(status.parent))

        if (status.origin) data.origin = updated.find(d => d._id.equals(status.origin))

        if (!user.equals(status.owner)) {
            try {
                let notification = await createNotification({
                    type: 'post-react',
                    action: req.body.action,
                    status: status._id,
                    constellation: status.constellation,
                    owner: status.owner
                }, user)

                if (!notification) throw Error('notif-failed')
            } catch (e) {
                console.error(e)
            }
        }
        
        data = await fieldsCheck('read', data._doc, Entities.status, data, user)
    } catch (e) {
        console.error(e)
        errors.push(e.message)
    }

    res.send({ data, errors, status: errors.length > 0 ? 0 : 1 })
}

exports.getFeed = async function (req, res) {
    let data = []
    let errors = []

    try {
        let user = await authenticate(req.headers)
        if (!user) throw Error('no-user')

        data = await Entities.status.model.find({
            $and: [
                {
                    $or: [
                        { gathering: {
                            $in: user.gatherings.filter(g => g.status == 'attending' || g.status == 'confirmed').map(g => g._id) 
                        }},

                        { owner: user._id },
                        
                        { constellation: { $in: user.constellations } },

                        { $and: [
                            { owner: { $in: user.friends } },
                            { constellation: null },
                            { gathering: null },
                        ] }
                    ],
                },
                { parent: null }
            ]
        })
    } catch (e) {
        console.error(e)
        errors.push(e.message)
    }

    res.send({ data, errors, status: errors.length > 0 ? 0 : 1 })
}