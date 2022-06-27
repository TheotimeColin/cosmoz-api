const mongoose = require('mongoose')
const { nanoid }  = require('nanoid')
const Entities = require('../entities')
const moment = require('moment-timezone')
moment.tz.setDefault('Europe/Paris')
const slugify = require('slugify')
const sanitize = require('sanitize-html')

const { createNotification } = require('../utils/notifications')
const { authenticate, accessCheck, fieldsCheck } = require('../utils/user')
const { getHandle } = require('../utils/base')
const { createMediaCollection } = require('../utils/files')

exports.consteCreate = async function (req, res) {
    let data = {}
    let errors = []

    try {
        if (!req.body.name) throw Error('missing-fields')

        let user = await authenticate(req.headers)
        if (!user) throw Error('no-user')

        if (user.createdConstellations.length >= 5 && !user.role.admin) throw Error('too-many-constellations')

        const constellations = await Entities.constellation.model.find()

        let slug = null
        let suffix = ''

        while (!slug) {
            let test = slugify(req.body.name, { lower: true, strict: true }) + suffix

            if (!constellations.map(c => c.slug).includes(test)) slug = test

            suffix = '-' + getHandle(4)
        }

        console.log(req.body)

        data = await Entities.constellation.model.create({
            name: sanitize(req.body.name),
            type: req.body.type == 'community' ? 'community' : 'group',
            slug: slug,
            members: [ user._id ],
            admins: [ user._id ]
        })

        if (data) {
            if (req.file) {
                try {
                    let logo = await createMediaCollection(req.file, {
                        path: `constellation/${data._id}/logo`
                    })

                    if (logo) {
                        data.logo = logo
                        await data.save()
                    }

                    data = await Entities.constellation.model.findOne({
                        _id: data._id
                    })
                } catch (e) {
                    console.error(e)
                }
            }

            user.constellations = [
                ...user.constellations,
                data._id
            ]

            user.createdConstellations = [
                ...user.createdConstellations,
                data._id
            ]

            await user.save()
        }
    } catch (e) {
        console.error(e)
        errors.push(e.message)
    }

    res.send({ data, errors, status: errors.length > 0 ? 0 : 1 })
}

exports.consteApply = async function (req, res) {
    let data = {}
    let errors = []

    try {
        let user = await authenticate(req.headers)
        if (!user) throw Error('no-user')

        let constellation = await Entities.constellation.model.updateOne({ _id: req.body.id }, { $addToSet: { followers: user._id }})

        if (!constellation) throw Error('no-constellation')

        data = await Entities.constellation.model.findOne({ _id: req.body.id })

        user.followedConstellations = [
            ...user.followedConstellations,
            data._id
        ]

        await user.save()

        try {
            await Promise.all(data.admins.map(async admin => {
                let notification = await createNotification({
                    type: 'conste-application',
                    constellation: data._id,
                    originator: { _id: user._id, type: 'user' },
                    owner: admin
                }, user)

                if (!notification) throw Error('notif-failed')
            }))
        } catch (e) {
            console.error(e)
        }
    } catch (e) {
        console.error(e)
        errors.push(e.message)
    }

    res.send({ data, errors, status: errors.length > 0 ? 0 : 1 })
}

exports.consteEnter = async function (req, res) {
    let data = {}
    let errors = []

    try {
        let user = await authenticate(req.headers)
        if (!user) throw Error('no-user')

        let conste = await Entities.constellation.model.findOne({ _id: req.body.conste })

        if (!conste) throw Error('no-constellation')
        if (!req.body.token && ![...conste.organizers, ...conste.admins].find(m => user._id.equals(m))) throw Error('not-authorized')

        if (req.body.token) {
            let token = await Entities.token.model.findOne({ id: req.body.token })

            if (!token || !token.constellation.equals(req.body.conste)) throw Error('token-invalid')

            req.body.user = user._id
        }

        let target = await Entities.user.model.findById(req.body.user)

        if (!target) throw Error('target-not-found')

        await Entities.constellation.model.updateOne({ _id: conste._id }, {
            $addToSet: { members: target._id },
            $pull: { followers: target._id }
        })

        target.constellations = [
            ...target.constellations, conste._id
        ]

        target.followedConstellations = target.followedConstellations.filter(c => !conste._id.equals(c))

        await target.save()

        data = await Entities.constellation.model.findOne({ _id: req.body.conste })

        if (!req.body.token) {
            try {
                let notification = await createNotification({
                    type: 'conste-enter',
                    constellation: data._id,
                    originator: { _id: data._id, type: 'constellation' },
                    owner: target._id
                }, user)

                if (!notification) throw Error('notif-failed')
            } catch (e) {
                console.error(e)
            }
        }

        data = await fieldsCheck('read', data._doc, Entities.constellation, data, user)
    } catch (e) {
        console.error(e)
        errors.push(e.message)
    }

    res.send({ data, errors, status: errors.length > 0 ? 0 : 1 })
}

exports.consteInviteLink = async function (req, res) {
    let data = {}
    let errors = []

    try {
        let user = await authenticate(req.headers)
        if (!user) throw Error('no-user')

        let constellation = await Entities.constellation.model.findOne({ _id: req.body.id })

        if (!constellation) throw Error('no-constellation')

        if (user.role !== 'admin' && !constellation.admins.find(u => user._id.equals(u))) throw Error('not-authorized')

        let id = nanoid()
        let token = await Entities.token.model.create({
            id: id, read: 'g-admin',
            type: 'invite',
            constellation: constellation._id
        })

        data.token = id
    } catch (e) {
        console.error(e)
        errors.push(e.message)
    }

    res.send({ data, errors, status: errors.length > 0 ? 0 : 1 })
}

exports.consteInviteLinkDelete = async function (req, res) {
    let data = {}
    let errors = []

    try {
        let user = await authenticate(req.headers)
        if (!user) throw Error('no-user')

        let token = await Entities.token.model.findOne({ _id: req.query.id })
        if (!token) throw Error('no-token')

        let constellation = await Entities.constellation.model.findOne({ _id: token.constellation })
        if (!constellation) throw Error('no-constellation')

        if (user.role !== 'admin' && !constellation.admins.find(u => user._id.equals(u))) throw Error('not-authorized')

        await token.remove()
    } catch (e) {
        console.error(e)
        errors.push(e.message)
    }

    res.send({ data, errors, status: errors.length > 0 ? 0 : 1 })
}

exports.consteLeave = async function (req, res) {
    let data = {}
    let errors = []

    try {
        let user = await authenticate(req.headers)
        if (!user) throw Error('no-user')

        let constellation = await Entities.constellation.model.updateOne({ _id: req.body.id }, { $pull: { followers: user._id, members: user._id, organizers: user._id }})

        if (!constellation) throw Error('no-constellation')

        user.constellations = user.constellations.filter(c => !c.equals(req.body.id))

        user.followedConstellations = user.followedConstellations.filter(c => !c.equals(req.body.id))

        await user.save()

        data = await Entities.constellation.model.findOne({ _id: req.body.id })
    } catch (e) {
        console.error(e)
        errors.push(e.message)
    }

    res.send({ data, errors, status: errors.length > 0 ? 0 : 1 })
}