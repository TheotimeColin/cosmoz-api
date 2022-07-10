const { $fetch } = require('ohmyfetch/node')
const Entities = require('../entities')
const { authenticate, accessCheck, fieldsCheck } = require('../utils/user')
const { createMail, sendMail } = require('../utils/mailing')
const moment = require('moment-timezone')
moment.tz.setDefault('Europe/Paris')
const { createNotification } = require('../utils/notifications')
const shortid = require('shortid')

const { uploadQR } = require('../utils/files')

exports.gatheringCreate = async function (req, res) {
    let data = null
    let errors = []

    try {
        let fields = req.body.params
        let user = await authenticate(req.headers)
        
        if (!user) throw Error('no-user')

        let conste = fields.constellation ? await Entities.constellation.model.findOne({ _id: fields.constellation }) : null
        
        let gathering = req.body._id && req.body._id !== 'new' ? await Entities.gathering.model.findOne({ id: req.body._id }) : null

        if (!fields.constellation) delete fields.constellation

        if (fields.type != 'hangout' && (!conste || ![...conste.organizers, ...conste.admins].includes(user._id)) && (!gathering || gathering && !gathering.organizers.includes(user._id))) {
            throw Error('not-authorized')
        }

        if (fields.type == 'hangout') {
            fields.status = 'active'
        }

        if (!gathering) {
            data = await Entities.gathering.model.create({
                ...fields,
                id: shortid.generate(),
                users: [ { _id: user._id, status: 'attending' } ],
                owner: user._id
            })

            user.gatherings = [
                ...user.gatherings,
                { _id: data._id, status: 'attending' }
            ]

            await user.save()
        } else {
            let toCheck = ['constellation', 'max', 'title', 'description', 'location', 'address', 'cover', 'dates']
            toCheck.forEach(field => {
                if (fields[field]) gathering.set({ [field]: fields[field] })
            })

            data = await gathering.save()
        }

        data = await Entities.gathering.model.findOne({ _id: data._id })
    } catch (e) {
        console.error(e)
        errors.push(e.message)
    }

    res.send({ data, errors, status: errors.length > 0 ? 0 : 1 })
}

exports.updateBookingStatus = async function (req, res) {
    let data = {}
    let errors = []

    try {
        let user = await authenticate(req.headers)
        let constellation = null
        let gathering = await Entities.gathering.model.findOne({ _id: req.body._id })
                
        if (!user) throw Error('no-user')
        if (!gathering) throw Error('g-not-found')

        await Promise.all(req.body.users.map(async userUpdate => {
            try {
                let status = userUpdate.status
                let add = userUpdate.add
                userUpdate = await Entities.user.model.findById(userUpdate._id)

                if (user.role !== 'admin' && user.role !== 'editor') {
                    if (!user._id.equals(userUpdate._id)) {
                        throw Error('not-authorized-self')
                    } else if (status == 'ghosted') {
                        throw Error('not-authorized')
                    } else if (status == 'attending' && gathering.users.filter(u => u.status == 'attending' || u.status == 'confirmed').length >= gathering.max) {
                        throw Error('g-full')
                    }
                }

                if (status == 'attending' && moment(gathering.date).isAfter(moment())) {
                    let sent = await sendConfirmationMail(gathering, user)
                    if (!sent) console.error('failed-mail')
                }

                if (status == 'confirmed') {
                    if (add && !userUpdate.constellations.find(c => c.equals(gathering.constellation))) {
                        constellation = await Entities.constellation.model.findOne({ _id: gathering.constellation })

                        constellation.members = [
                            ...constellation.members,
                            userUpdate._id
                        ]

                        constellation.followers = constellation.followers.filter(f => !f.equals(userUpdate._id))
                
                        userUpdate.constellations = [
                            ...userUpdate.constellations,
                            constellation._id
                        ]

                        userUpdate.followedConstellations = userUpdate.followedConstellations.filter(c => !c.equals(constellation._id))

                        await constellation.save()

                        data.constellation = constellation
                    }

                    await createNotification({
                        type: 'gathering-confirmed',
                        gathering: gathering._id,
                        originator: {
                            _id: gathering._id, type: 'gathering'
                        },
                        owner: userUpdate._id
                    }, userUpdate)
                }

                gathering.users = [
                    ...gathering.users.filter(u => u._id != userUpdate._id),
                    { _id: userUpdate._id, status: status }
                ]

                userUpdate.gatherings = userUpdate.gatherings.filter(g => !gathering._id.equals(g._id))
                
                userUpdate.gatherings = [
                    ...userUpdate.gatherings,
                    { _id: gathering._id, status }
                ]

                await userUpdate.save()
            } catch (e) {
                console.error(e)
            }

            return userUpdate
        }))

        await Promise.all(gathering.users.map(async userUpdate => {
            if (userUpdate.status == 'confirmed') {
                let users = gathering.users.filter(u => u.status == 'confirmed' && u._id != userUpdate._id).map(u => u._id)

                return await Entities.user.model.findByIdAndUpdate(userUpdate._id, {
                    ['$addToSet']: { encounters: users }
                })
            }
        }))
        
        await gathering.save()

        data.gathering = await Entities.gathering.model.findOne({ _id: gathering._id })
    } catch (e) {
        console.error(e)
        errors.push(e.message)
    }

    res.send({ data, errors, status: errors.length > 0 ? 0 : 1 })
}

const sendConfirmationMail = async function (gathering, user) {
    return new Promise(async (resolve, reject) => {
        let cover = gathering.cover ? gathering.cover.medias.find(m => m.size == 'm') : ''
        // let qr = `gatherings/${gathering.id}/${user.id}.png`

        // try {
        //     await req.app.locals.s3.headObject({
        //         Bucket: process.env.S3_BUCKET, Key: qr
        //     }).promise()

        //     qr = `https://${process.env.S3_BUCKET}.s3.eu-west-3.amazonaws.com/${qr}`
        // } catch (e) {
        //     qr = await uploadQR(process.env.APP_URL + '/v/' + gathering.id + '?user=' + user.id, qr)
        // }

        try {
            const constellation = await Entities.constellation.model.findOne({ _id: gathering.constellation })

            await sendMail(user, {
                template: 1,
                // attachment: [
                //     { name: `qr_code.png`, url: qr }
                // ],
                params: {
                    date: moment(gathering.date).format('D MMMM YYYY à HH:mm'),
                    location: gathering.location,
                    address: gathering.address,
                    name: gathering.title,
                    image: cover ? cover.src : '',
                    link: process.env.BASE_URL + '/c/' + constellation.slug + '/events/' + gathering.id,
                    cancel: process.env.BASE_URL + '/c/' + constellation.slug + '/events/' + gathering.id + '?manage'
                }
            })

            resolve(true)
        } catch (e) {
            console.error(e)
            reject(false)
        }
    })
}