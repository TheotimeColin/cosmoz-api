const Entities = require('../entities')
const moment = require('moment-timezone')
moment.tz.setDefault('Europe/Paris')

const { authenticate, accessCheck, fieldsCheck } = require('../utils/user')
const { createNotification } = require('../utils/notifications')

exports.createReaction = async function (req, res) {
    let data = {}
    let errors = []

    try {
        let fields = req.body

        if (!fields.type) throw Error('missing-fields')

        let user = await authenticate(req.headers)
        if (!user) throw Error('no-user')

        let status = fields.status ? await Entities.status.model.findOne({
            _id: fields.status
        }) : null

        let reaction = await Entities.reaction.model.findOne({
            type: req.body.type,
            owner: user._id,
            ...(status ? { status: status._id } : { id: req.body.id })
        })

        if (!reaction) {
            reaction = await Entities.reaction.model.create({
                id: req.body.id,
                type: req.body.type,
                owner: user._id,
                status: status ? status._id : null
            })

            if (status) {
                status.reactions = [ ...status.reactions, reaction._id ]
                await status.save()

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
            }
        } else {
            throw Error('error')
        }

        data.reaction = reaction

        if (status) {
            let updated = await Entities.status.model.find({ _id: { $in: [status._id, status.parent, status.origin] } })
        
            data.status = updated.find(d => d._id.equals(fields.status))

            if (status.parent) data.parent = updated.find(d => d._id.equals(status.parent))

            if (status.origin) data.origin = updated.find(d => d._id.equals(status.origin))
            
            data.status = await fieldsCheck('read', data.status._doc, Entities.status, data.status, user)
        }
    } catch (e) {
        console.error(e)
        errors.push(e.message)
    }

    res.send({ data, errors, status: errors.length > 0 ? 0 : 1 })
}

exports.deleteReaction = async function (req, res) {
    let data = {}
    let errors = []

    try {
        let fields = req.query
        
        if (!fields.type) throw Error('missing-fields')

        let user = await authenticate(req.headers)
        if (!user) throw Error('no-user')

        let status = fields.status ? await Entities.status.model.findOne({
            _id: fields.status
        }) : null

        let reaction = await Entities.reaction.model.findOne({
            type: fields.type,
            owner: user._id,
            ...(status ? { status: status._id } : { id: fields.id })
        })

        data.reaction = reaction

        if (reaction) {
            if (status) {
                status.reactions = status.reactions.filter(r => !r._id.equals(reaction._id))

                await status.save()
            }

            await reaction.remove()
        } else {
            throw Error('error')
        }

        if (status) {
            let updated = await Entities.status.model.find({ _id: { $in: [status._id, status.parent, status.origin] } })
        
            data.status = updated.find(d => d._id.equals(fields.status))

            if (status.parent) data.parent = updated.find(d => d._id.equals(status.parent))

            if (status.origin) data.origin = updated.find(d => d._id.equals(status.origin))
            
            data.status = await fieldsCheck('read', data.status._doc, Entities.status, data.status, user)
        }
    } catch (e) {
        console.error(e)
        errors.push(e.message)
    }

    res.send({ data, errors, status: errors.length > 0 ? 0 : 1 })
}