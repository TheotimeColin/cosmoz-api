const jwt = require('jsonwebtoken')
const jwt_decode = require('jwt-decode')
const sanitize = require('sanitize-html')

const { $fetch } = require('ohmyfetch/node')
const Entities = require('../entities')
const shortid = require('shortid')
const moment = require('moment-timezone')
moment.tz.setDefault('Europe/Paris')
const { sendMail } = require('../utils/mailing')
const { createMediaCollection } = require('../utils/files')
const USERID = require('../utils/user-id');

const { authenticate } = require('../utils/user')
const { ErrorModel } = require('sib-api-v3-sdk')

exports.logUser = async function (req, res) {
    let errors = []
    let data = null
    let token = null

    try {
        let register = req.body.type == 'register'
        let authenticated = false
        let user = null
        let data = {}
        const allUsers = await Entities.user.model.find()

        if (req.body.credential) {
            const responsePayload = jwt_decode(req.body.credential)

            data = {
                email: responsePayload.email,
                name: responsePayload.given_name,
                password: shortid.generate()
            }

            if (responsePayload.picture && false) {
                let picture = await createMediaCollection(responsePayload.picture.replace('s96-c', 's500-c'), {
                    direct: true,
                    size: 'profile',
                    path: 'library/g-users'
                })

                if (picture) data.picture = picture
            }
        } else {
            if (!req.body.email || !req.body.password || !req.body.token) throw Error('missing-fields')

            data = {
                email: sanitize(req.body.email),
                password: req.body.password,
                name: sanitize(req.body.name)
            }
        
            if (process.env.RECAPTCHA_BYPASS != "true") {
                const challenge = await $fetch(`https://www.google.com/recaptcha/api/siteverify?secret=${process.env.RECAPTCHA_SECRET}&response=${req.body.token}`)

                if (!challenge.success) throw Error('challenge-failed')
            }
        }
        
        if (!data.email) throw Error('no-data-provided')

        user = allUsers.find(u => u.email == data.email)
        
        if (!req.body.credential && register && user && user.password) throw Error('already-registered')
        if (!register && !user) throw Error('email-not-found')
        
        if (user && user.password) {
            authenticated = req.body.credential ? true : await user.comparePassword(data.password)
        } else if (register || (user && !user.password)) {
            let newId = null
            let numbers = [ '0', '1', '2', '3', '4', '5', '6', '7', '8', '9']

            while (!newId) {
                let test = USERID.names[Math.floor(Math.random() * (USERID.names.length))] + '.' + USERID.adjectives[Math.floor(Math.random() * (USERID.adjectives.length))] + '.' + (numbers[Math.floor(Math.random() * (numbers.length))] + numbers[Math.floor(Math.random() * (numbers.length))] + numbers[Math.floor(Math.random() * (numbers.length))])

                if (!allUsers.map(u => u.id).includes(test)) newId = test
            }

            if (user) {
                user.id = newId

                if (data.name) user.name = data.name
                user.password = data.password
            } else {
                user = await Entities.user.model.create({
                    id: newId,
                    ...data,
                    ref: sanitize(req.body.ref),
                    role: 'user'
                })
            }

            user.owner = user._id
            await user.save()

            if (!user) throw Error('error')

            authenticated = true

            try {
                let apiInstance = new req.app.locals.sendinBlue.ContactsApi()
                let createContact = new req.app.locals.sendinBlue.CreateContact()

                createContact.email = data.email
                createContact.listIds = [3, 5]

                createContact.attributes = {
                    PRENOM: data.name
                }
                
                if (process.env.NODE_ENV == "PRODUCTION") await apiInstance.createContact(createContact)
            } catch (e) {
                console.error(e)
            }

            try {
                let fetch = await $fetch(encodeURI(`https://wirepusher.com/send?id=${process.env.WIRE_PUSHER}&title=${user.name} s'est inscrit(e)&message=${user.email}&type=register`))
            } catch (e) {
                console.error(e)
            }
        }

        if (authenticated) {
            token = jwt.sign({ id: user._id }, process.env.SECRET, {
                expiresIn: 864000
            })
        } else {
            throw Error('wrong-credentials')
        }
    } catch (e) {
        console.error(e)
        errors.push(e.message)
    }

    res.send({
        data, errors, token,
        status: errors.length > 0 ? 0 : 1
    })
}

exports.getUser = async function (req, res) {
    let errors = []
    let user = null

    try {
        user = await authenticate(req.headers)
        if (!user) throw Error('wrong-credentials')
    } catch (e) {
        console.error(e)
        errors.push(e.message)
    }

    res.send({
        user, status: errors.length > 0 ? 0 : 1,
        errors
    })
}

exports.logOut = async function (req, res) {
    let errors = []

    res.send({
        token: null, status: errors.length > 0 ? 0 : 1,
        errors
    })
}

exports.requestResetPassword = async function (req, res) {
    let errors = []
    
    try {
        let user = await Entities.user.model.findOne({ email: req.body.email })

        if (!user) throw Error('user-not-found')

        let token = await Entities.token.model.create({
            id: shortid.generate(),
            value: req.body.email,
            expiration: moment().add(2, 'days').toDate()
        })

        await sendMail(user, {
            template: 2,
            params: {
                LINK: `${process.env.BASE_URL}/compte/reset?token=${token.id}`
            }
        })
    } catch (e) {
        console.error(e)
        errors.push(e.message)
    }

    res.send({
        status: errors.length > 0 ? 0 : 1,
        errors
    })
}

exports.resetPassword = async function (req, res) {
    let errors = []
    
    try {
        let token = await Entities.token.model.findOne({
            id: req.body.token
        })
        
        if (!token) throw Error('token-expired')

        await Entities.token.model.findByIdAndDelete(token._id)

        let user = await Entities.user.model.findOne({ email: token.value })

        if (!user) throw Error('user-not-found')

        user.password = req.body.password
        user.save()
    } catch (e) {
        console.error(e)
        errors.push(e.message)
    }

    res.send({
        status: errors.length > 0 ? 0 : 1,
        errors
    })
}

exports.subscribeNewsletter = async function (req, res) {
    let errors = []

    try {
        if (process.env.RECAPTCHA_BYPASS != "true") {
            const challenge = await $fetch(`https://www.google.com/recaptcha/api/siteverify?secret=${process.env.RECAPTCHA_SECRET}&response=${req.body.token}`)

            if (!challenge.success) throw Error('challenge-failed')
        }

        user = await Entities.user.model.findOne({ email: req.body.email })
        if (!user) {
            user = await Entities.user.model.create({
                email: req.body.email,
                name: req.body.name,
                referral: req.body.referral,
                ref: req.body.ref,
                role: 'user'
            })

            user.owner = user._id
            user.save()
        } else {
            throw Error('already-subscribed')
        }

        let apiInstance = new req.app.locals.sendinBlue.ContactsApi()
        let createContact = new req.app.locals.sendinBlue.CreateContact()

        createContact.email = req.body.email
        createContact.listIds = [3, 4]

        createContact.attributes = {
            PRENOM: req.body.name
        }

        try {
            let fetch = await $fetch(encodeURI(`https://wirepusher.com/send?id=${process.env.WIRE_PUSHER}&title=${req.body.name} s'est abonné(e)&message=${req.body.email}&type=subscriber`))
        } catch (e) {
            console.error(e)
        }

        if (process.env.NODE_ENV == "PRODUCTION") await apiInstance.createContact(createContact)
    } catch (e) {
        console.error(e)
        errors.push(e.message)
    }

    res.send({ errors, status: errors.length > 0 ? 0 : 1 })
}