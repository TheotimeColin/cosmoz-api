const { authenticate } = require('../utils/user')
const Entities = require('../entities')
const striptags  = require('striptags')
const linkifyHtml = require('linkify-html');

exports.createChannel = async function (req, res) {
    let data = {}
    let errors = []

    try {
        let user = await authenticate(req.headers)
        if (!user) throw Error('no-user')
        
        if (!req.body.users || req.body.users.length < 2) throw Error('missing-users')

        let users = await Entities.user.model.find({
            _id: { $in: req.body.users }
        })

        users.forEach(reqUser => {
            if (!user._id.equals(reqUser._id) && (!user.friends.includes(reqUser._id) || !reqUser.friends.includes(user._id))) {
                throw Error('forbidden-user')
            }
        })

        let channel = await Entities.channel.model.create({
            users: users.map(u => u._id),
            readBy: [ user._id ],
            owner: user._id
        })

        if (req.body.content) {
            let message = await Entities.channelMessage.model.create({
                content: striptags(req.body.content),
                channel: channel._id,
                owner: user._id
            })

            if (message) {
                data.message = await Entities.channelMessage.model.findOne({ _id: message._id })

                channel.lastMessage = message._id
                await channel.save()
            }
        }

        if (channel) data.channel = { ...channel._doc, lastMessage: data.message }

        if (data.channel) req.app.locals.io.emit('new-channel', data.channel)
        if (data.message) req.app.locals.io.emit('new-message', data.message)
    } catch (e) {
        console.error(e)
        errors.push(e.message)
    }

    res.send({ data, errors, status: errors.length > 0 ? 0 : 1 })
}

exports.postMessage = async function (req, res) {
    let data = {}
    let errors = []

    try {
        let fields = {
            ...req.body
        }

        if (!req.body.content) throw Error('no-content')

        let user = await authenticate(req.headers)
        if (!user) throw Error('no-user')

        let channel = await Entities.channel.model.findOne({ _id: fields.channel })
        if (!channel) throw Error('no-channel')

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

        fields.content = striptags(fields.content)
        fields.content = linkifyHtml(fields.content, {
            target: '_blank',
            truncate: 42
        })

        let message = await Entities.channelMessage.model.create({
            ...fields,
            channel: channel._id,
            owner: user._id
        })

        channel.readBy = [ user._id ]
        channel.lastMessage = message._id
        await channel.save()

        data.message = await Entities.channelMessage.model.findOne({ _id: message._id })

        data.channel = { ...channel._doc, lastMessage: data.message }

        if (data.channel) req.app.locals.io.to(channel.users.filter(u => !u.equals(user._id)).map(u => u.toString())).emit('new-channel', data.channel)
        
        if (data.message) req.app.locals.io.to(channel.users.filter(u => !u.equals(user._id)).map(u => u.toString())).emit('new-message', data.message)
    } catch (e) {
        console.error(e)
        errors.push(e.message)
    }

    res.send({ data, errors, status: errors.length > 0 ? 0 : 1 })
}