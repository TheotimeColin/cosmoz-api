var CronJob = require('cron').CronJob
const mongoose = require('mongoose')
const moment = require('moment-timezone')
moment.tz.setDefault('Europe/Paris')

const { createMail, sendBulkMail, sendMail } = require('../utils/mailing')
const Entities = require('../entities')

module.exports = async function (app) {
    if (app.locals.hourly) return

    await checkGatherings()
    await sendPendingEmails()

    app.locals.hourly = new CronJob('* 30 * * * *', async () => {
        console.log('CRON')

        await checkGatherings()
        await sendPendingEmails()
    }, null, true)
}

const TEMPLATES = {
    EVENT_REMINDER: 3,
    EVENT_END: 4
}

const sendPendingEmails = function () {
    return new Promise(async resolve => {
        try {
            const mails = await Entities.mail.model.find({
                status: { $in: ['pending', 'failed' ] },
                date: {
                    $lte: new Date()
                }
            }).populate('user').populate({ path : 'gathering', populate : { path : 'cover' } })
            
            const constellations = await Entities.constellation.model.find({
                _id: { $in: mails.reduce((all, m) => [ ...all, ...(m.gathering ? [m.gathering.constellation] : [])], []) }
            })

            let toSend = mails.reduce((all, mail) => {
                let id = TEMPLATES[mail.type]

                if (!id) return all

                let params = {
                    ...mail.params
                }

                let userParams = {}

                if (mail.gathering) {
                    let cover = mail.gathering.cover ? mail.gathering.cover.medias.find(m => m.size == 'm') : ''

                    params = {
                        ...params,
                        G_date: moment(mail.gathering.date).format('D MMMM YYYY à HH:mm'),
                        G_location: mail.gathering.location,
                        G_address: mail.gathering.address,
                        G_title: mail.gathering.title,
                        G_cover: cover ? cover.src : '',
                        G_link: process.env.BASE_URL + '/c/' + constellations.find(c => c._id.equals(mail.gathering.constellation)).slug + '/events/' + mail.gathering.id
                    }
                }

                if (mail.user) {
                    userParams = {
                        ...userParams,
                        U_name: mail.user.name
                    }
                }
                

                return {
                    ...all,
                    [id]: {
                        params,
                        mails: [ ...(all[id] ? all[id].mails : []), mail._id ],
                        targets: [ ...(all[id] ? all[id].targets : []), {
                            to: [ { email: mail.user.email } ], params: userParams
                        } ]
                    }
                }
            }, {})
            
            await Promise.all(Object.entries(toSend).map(async t => {
                try {
                    const response = await sendBulkMail(t[1].targets, {
                        template: parseInt(t[0]),
                        params: t[1].params
                    })

                    await Entities.mail.model.updateMany({
                        _id: { $in: t[1].mails }
                    }, { status: response ? 'success' : 'failed' })
                } catch (e) {
                    console.error(e)
                }
                
                return t
            }))
        } catch (e) {
            console.error(e)
        }

        resolve(true)
    })
}

const checkGatherings = function () {
    return new Promise(async resolve => {
        const gatherings = await Entities.gathering.model.find({
            status: 'active',
            date: { $gte: moment().subtract(2, 'days').toDate() }
        })

        const users = gatherings.reduce((t, g) => [ ...t, ...g.users], []).filter(u => u.status == 'attending' || u.status == 'confirmed').map(u => mongoose.Types.ObjectId(u._id))

        await Promise.all(gatherings.map(async gathering => {
            try {
                let gUsers = [ ...new Set(users.filter(u => gathering.users.find(g => u.equals(g._id))).map(g => g.toString())) ]

                if (moment(gathering.date).subtract(2, 'days').isBefore(moment())) {
                    await Promise.all(gUsers.map(async gUser => {
                        return await createMail({
                            type: 'EVENT_REMINDER',
                            date: moment(),
                            gathering: gathering._id,
                            user: gUser
                        })
                    }))
                }

                if (moment(gathering.date).add(2, 'hours').isBefore(moment())) {
                    await Promise.all(gUsers.map(async gUser => {
                        return await createMail({
                            type: 'EVENT_END',
                            date: moment(),
                            gathering: gathering._id,
                            user: gUser
                        })
                    }))
                }
            } catch (e) {
                console.error(e)
            }

            return true
        }))

        resolve(true)
    })
}