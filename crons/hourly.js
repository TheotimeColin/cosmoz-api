var CronJob = require('cron').CronJob
const moment = require('moment-timezone')
moment.tz.setDefault('Europe/Paris')

const { sendBulkMail, sendMail } = require('../utils/mailing')
const Entities = require('../entities')

module.exports = function (app) {
    if (app.locals.hourly) return

    // app.locals.hourly = new CronJob('* 30 * * * *', () => {
    //     sendPendingEmails()
    //     sendGatheringReminders()
    // }, null, true)
}

const TEMPLATES = {
    EVENT_CONFIRM: 4
}

const sendPendingEmails = async function () {
    const mails = await Entities['mail'].model.find({
        status: { $in: ['pending', 'failed' ] },
        date: {
            $lte: new Date()
        }
    })

    await Promise.all(mails.map(async mail => {
        try {
            let params = {
                ...mail.params
            }

            if (mail.gathering) {
                let cover = mail.gathering.cover ? mail.gathering.cover.medias.find(m => m.size == 'm') : ''

                const constellation = await Entities.constellation.model.findOne({ _id: mail.gathering.constellation })

                params = {
                    ...params,
                    G_date: moment(mail.gathering.date).format('D MMMM YYYY à HH:mm'),
                    G_location: mail.gathering.location,
                    G_title: mail.gathering.title,
                    G_cover: cover ? cover.src : '',
                    G_link: process.env.BASE_URL + '/c/' + constellation.slug + '/events/' + mail.gathering.id
                }
            }

            if (mail.user) {
                params = {
                    ...params,
                    U_name: mail.user.name
                }
            }

            const response = await sendMail(mail.user, {
                template: TEMPLATES[mail.type],
                params: params,
                attachment: mail.attachment && mail.attachment.length > 0 ? mail.attachment : null
            })

            if (response) mail.status = 'sent'
        } catch (e) {
            console.error(e)
            mail.status = 'failed'
        }

        return await mail.save()
    }))
}

const sendGatheringReminders = async function () {
    const gatherings = await Entities['gathering'].model.find({
        reminded: false,
        status: 'active',
        date: {
            $lte: moment().add(2, 'days').toDate()
        }
    })

    await Promise.all(gatherings.map(async gathering => {
        let users = gathering.users.filter(u => u.status == 'attending').map(u => u._id)
        
        users = await Entities.user.model.find({ _id: { $in: users }})

        users = users.map(user => {
            let qr = `https://${process.env.S3_BUCKET}.s3.eu-west-3.amazonaws.com/gatherings/${gathering.id}/${user.id}.png`

            return {
                to: [ { email: user.email } ],
                params: { qr }
            }
        })
        
        try {
            let cover = gathering.cover ? gathering.cover.medias.find(m => m.size == 'm') : ''

            const constellation = await Entities.constellation.model.findOne({ _id: gathering.constellation })

            const response = await sendBulkMail(users, {
                template: 3,
                params: {
                    date: moment(gathering.date).format('D MMMM YYYY à HH:mm'),
                    location: gathering.location,
                    name: gathering.title,
                    image: cover ? cover.src : '',
                    link: process.env.BASE_URL + '/c/' + constellation.slug + '/events/' + gathering.id,
                    cancel: process.env.BASE_URL + '/c' + constellation.slug + '/events/' + gathering.id + '?manage'
                }
            })

            if (response) gathering.reminded = true
        } catch (e) {
            console.error(e)
        }

        return await gathering.save()
    }))
}