const jwt = require('jsonwebtoken')
const { $fetch } = require('ohmyfetch/node')
const Entities = require('../entities')
const moment = require('moment-timezone')
moment.tz.setDefault('Europe/Paris')

const { authenticate } = require('../utils/user')
const { requestFriend } = require('../utils/social')

exports.sendMentions = async function (req, res) {
    let data = {}
    let errors = []

    try {
        let user = await authenticate(req.headers)
        let gathering = await Entities.gathering.model.findById(req.body.gathering)
        let target = await Entities.user.model.findById(req.body.target)

        if (!gathering) throw Error('gathering-not-found')
        if (!target) throw Error('target-user-not-found')
        
        if (!gathering.users.find(u => target._id.equals(u._id) && (u.status == 'confirmed' || u.status == 'attending')) || !gathering.users.find(u => user._id.equals(u._id) && (u.status == 'confirmed' || u.status == 'attending'))) throw Error('users-not-connected')

        let mention = await Entities.mention.model.findOne({
            gathering: gathering._id,
            target: target._id,
            owner: user._id
        })
        
        if (mention) throw Error('already-sent')

        data.mention = await Entities.mention.model.create({
            types: req.body.mentions.slice(0, 2),
            gathering: gathering._id,
            target: target._id,
            owner: user._id
        })

        if (req.body.requestFriend) data.match = await requestFriend(user, target)
    } catch (e) {
        console.error(e)
        errors.push(e.message)
    }

    res.send({ data, errors, status: errors.length > 0 ? 0 : 1 })
}

exports.unmatch = async function (req, res) {
    let data = {}
    let errors = []

    try {
        let user = await authenticate(req.headers)
        let target = await Entities.user.model.findById(req.body._id)

        if (!target) throw Error('target-user-not-found')

        user.affinities = user.affinities.filter(u => !target._id.equals(u))
        user.friends = user.friends.filter(u => !target._id.equals(u))

        target.affinities = target.affinities.filter(u => !user._id.equals(u))
        target.friends = target.friends.filter(u => !user._id.equals(u))

        await user.save()
        await target.save()
    } catch (e) {
        console.error(e)
        errors.push(e.message)
    }

    res.send({ data, errors, status: errors.length > 0 ? 0 : 1 })
}

exports.createRequest = async function (req, res) {
    let data = {}
    let errors = []

    try {
        let user = await authenticate(req.headers)
        let target = await Entities.user.model.findOne({ _id: req.body._id })
        
        if (!target) throw Error('target-not-found')

        data.match = await requestFriend(user, target)
    } catch (e) {
        console.error(e)
        errors.push(e.message)
    }

    res.send({ data, errors, status: errors.length > 0 ? 0 : 1 })
}

exports.cancelRequest = async function (req, res) {
    let data = {}
    let errors = []

    try {
        let user = await authenticate(req.headers)
        user.affinities = user.affinities.filter(u => !u.equals(req.body._id))
        
        await user.save()
    } catch (e) {
        console.error(e)
        errors.push(e.message)
    }

    res.send({ data, errors, status: errors.length > 0 ? 0 : 1 })
}