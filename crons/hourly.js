var CronJob = require('cron').CronJob
const mongoose = require('mongoose')
const moment = require('moment-timezone')
moment.tz.setDefault('Europe/Paris')

const { createMail, sendBulkMail, sendMail } = require('../utils/mailing')
const Entities = require('../entities')

module.exports = async function (app) {
    if (app.locals.hourly) return

    // await sendNotifications()
    // await sendPendingEmails()

    app.locals.hourly = new CronJob('* 30 * * * *', async () => {
        await checkGatherings()
        await sendPendingEmails()
    }, null, true)

    app.locals.weekly = new CronJob('* * 11 * * Sun', async () => {
        // await sendNotifications()
        await sendPendingEmails()
    }, null, true)
}

const TEMPLATES = {
    EVENT_REMINDER: 3,
    EVENT_END: 4,
    NOTIF_WEEKLY: 6
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
                        params: { notEmpty: true },
                        mails: [ ...(all[id] ? all[id].mails : []), mail._id ],
                        targets: [ ...(all[id] ? all[id].targets : []), {
                            to: [ { email: mail.user.email } ],
                            params: { ...userParams, ...params }
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

const sendNotifications = function () {
    return new Promise(async resolve => {
        let users = await Entities.user.model.find()

        await Promise.all(users.map(async user => {
            try {
                let mainNotifications = []
                let consteActivity = []

                let notifications = await Entities.notification.model.find({
                    state: 'unread',
                    owner: user._id,
                    createdAt: { $gte: moment().subtract(10, 'days').toDate() }
                })

                let conversations = await Entities.channel.model.find({
                    readBy: { "$ne": user._id },
                    users: user._id
                })

                let constellations = await Entities.constellation.model.find({
                    _id: { $in: user.constellations }
                })

                let statuses = await Entities.status.model.find({
                    constellation: { $in: user.constellations.map(c => c._id) },
                    createdAt: { $gte: moment().subtract(7, 'days').toDate() },
                })

                statuses = statuses.reduce((t, s) => ({
                    ...t,
                    [s.constellation]: (t[s.constellation] ? t[s.constellation] : 0) + 1
                }), {})

                if (conversations.length > 0) {
                    mainNotifications = [
                        ...mainNotifications,
                        { text: `📩 Tu as reçu ${conversations.length} message(s) privés.` }
                    ]
                }

                if (Object.entries(statuses).filter(s => s[1] > 1).length > 0) {
                    Object.entries(statuses).filter(s => s[1] > 1).forEach(status => {
                        let conste = constellations.find(c => c._id.equals(status[0])) 

                        consteActivity.push({
                            name: conste.name,
                            link: process.env.BASE_URL + '/c/' + conste.slug + '/feed',
                            count: status[1]
                        })
                    })
                }

                if (notifications.filter(n => n.type == 'friends-new').length > 0) {
                    mainNotifications = [
                        ...mainNotifications,
                        { text: `✨ ${notifications.filter(n => n.type == 'friends-new').length} personne(s) ont accepté ta demande d'amis !` }
                    ]
                }

                if (notifications.filter(n => n.type == 'conste-enter').length > 0) {
                    mainNotifications = [
                        ...mainNotifications,
                        { text: `👋 Ta demande a été acceptée dans ${notifications.filter(n => n.type == 'conste-enter').length} constellation(s) !` }
                    ]
                }

                if (notifications.filter(n => n.type == 'post-reply').length > 0) {
                    mainNotifications = [
                        ...mainNotifications,
                        { text: `👀 ${notifications.filter(n => n.type == 'post-reply').length} personnes t'ont répondu.` }
                    ]
                }

                let gatherings = await Entities.gathering.model.find({
                    constellation: { $in: user.constellations },
                    date: { $gte: new Date() },
                    status: 'active'
                }).sort('-date')

                gatherings = gatherings.map(g => {
                    let cover = g.cover ? g.cover.medias.find(m => m.size == 's') : ''

                    return {
                        title: g.title,
                        date: moment(g.date).format('D MMMM YYYY'),
                        cover: cover ? cover.src : '',
                        link: process.env.BASE_URL + '/c/' + constellations.find(c => c._id.equals(g.constellation)).slug + '/events/' + g.id,
                        constellation: constellations.find(c => c._id.equals(g.constellation)).name
                    }
                })

                if (notifications.filter(n => n.type == 'post-react').length > 0) {
                    mainNotifications = [
                        ...mainNotifications,
                        { text: `😱 ${notifications.filter(n => n.type == 'post-react').length} personnes ont réagi à tes publications.` }
                    ]
                }
                
                if (consteActivity.length > 0 || mainNotifications.length > 0 || gatherings.length > 0) {
                    await createMail({
                        id: `weekly-${moment().isoWeek()}-${moment().year()}`,
                        type: 'NOTIF_WEEKLY',
                        date: moment(),
                        params: {
                            hasConste: consteActivity.length > 0,
                            constellations: consteActivity,
                            hasFeatured: mainNotifications.length > 0,
                            notifications: mainNotifications,
                            hasEvents: gatherings.length > 0,
                            events: gatherings
                        },
                        user: user
                    })
                }
            } catch (e) {

            }
             
            return true
        }))

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

                if (moment(gathering.date).isAfter(moment()) && moment(gathering.date).subtract(2, 'days').isBefore(moment())) {
                    await Promise.all(gUsers.map(async gUser => {
                        return await createMail({
                            type: 'EVENT_REMINDER',
                            date: moment(),
                            gathering: gathering._id,
                            user: gUser
                        })
                    }))
                }

                if (moment(gathering.date).add(5, 'hours').isBefore(moment())) {
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