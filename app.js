require('dotenv').config()

const express = require('express')
const bodyParser = require('body-parser')
const cors = require('cors')
const morgan = require('morgan')
const MongoClient = require('mongodb').MongoClient
const mongoose = require('mongoose')
const multer  = require('multer');
const AWS = require('aws-sdk')
const AutoIncrementFactory = require('mongoose-sequence');
// const stripe = require('stripe')(process.env.STRIPE)
const SibApiV3Sdk = require('sib-api-v3-sdk');
let sendinBlue = SibApiV3Sdk.ApiClient.instance;
let apiKey = sendinBlue.authentications['api-key']
apiKey.apiKey = process.env.SENDINBLUE
var moment = require('moment')
require('moment/locale/fr')
moment.locale('fr')

const cronHourly = require('./crons/hourly.js')
const app = express()

require('./entities/index')
const { createEntity, getEntities, deleteEntity } = require('./api/entity')
const { logUser, logOut, getUser, requestResetPassword, resetPassword, subscribeNewsletter } = require('./api/user')
const { updateBookingStatus } = require('./api/gathering');
const { sendMentions, unmatch, createRequest, cancelRequest } = require('./api/affinities')
const { getFeed, postStatus, reactStatus } = require('./api/status')
const { scrape } = require('./api/scraper')
const { notificationRead } = require('./api/notification')
const { consteCreate, consteApply, consteLeave, consteEnter, consteInviteLink, consteInviteLinkDelete } = require('./api/constellation')
const { getToken } = require('./api/token')

const allowedOrigins = [
    'capacitor://localhost',
    'ionic://localhost',
    'http://localhost',
    'http://cosmoz.local',
    'https://cosmoz.social',
    'https://www.cosmoz.social',
    'https://cosmoz.events',
    'https://www.cosmoz.events',
    'https://cosmoz.dev',
    'https://www.cosmoz.dev',
    'http://localhost:8080',
    'http://localhost:8100'
];

const corsOptions = {
    origin: (origin, callback) => {
        if (allowedOrigins.includes(origin) || !origin) {
            callback(null, true);
        } else {
            callback(new Error('Origin not allowed by CORS'));
        }
    }
}

app.options('*', cors())

app.use(morgan('combined'))
app.use(express.json({ limit: '10mb', extended: true }))
app.use(express.urlencoded({ limit: '10mb', extended: true }))
app.use(cors(corsOptions))

const s3 = new AWS.S3({
    accessKeyId: process.env.S3_ID,
    secretAccessKey: process.env.S3_SECRET
})

const storage = multer.diskStorage({
    destination : 'uploads/',
    limits: { fieldSize: 2 * 1024 * 1024 },
    filename: function (req, file, cb) {
      cb(null, file.originalname)
    }
})

const upload = multer({ storage: storage })

app.locals.s3 = s3
app.locals.increment = AutoIncrementFactory(mongoose.connection)
// app.locals.stripe = stripe
app.locals.sendinBlue = SibApiV3Sdk

const server = require('http').Server(app)
const io = require('socket.io')(server, {
    cors: {
        origin: process.env.BASE_URL,
        methods: ["GET", "POST"]
    }    
})

const messages = []
io.on('connection', (socket) => {
    socket.on('last-messages', function (fn) {
        fn(messages.slice(-50))
    })

    socket.on('send-message', function (message) {
        messages.push(message)
        socket.broadcast.emit('new-message', message)
    })
})

mongoose.connection.on('error', console.error.bind(console, 'connection error:'))

mongoose.connection.once('open', async () => {

    app.get('/entities/get', getEntities)
    app.post('/entities/get', getEntities)

    app.post('/entities', upload.single('file'), createEntity)
    
    app.delete('/entities', deleteEntity)

    app.post('/user', logUser)
    app.get('/user', getUser)
    app.post('/user/logout', logOut)
    app.post('/user/reset', requestResetPassword)
    app.post('/user/reset/confirm', resetPassword)
    app.post('/user/subscribe', subscribeNewsletter)

    app.post('/gathering/book', updateBookingStatus)

    app.get('/status/feed', getFeed)
    app.post('/status/post', upload.array('images', 4), postStatus)
    app.post('/status/react', reactStatus)

    app.post('/affinities/send-mentions', sendMentions)
    app.post('/affinities/remove-match', unmatch)
    app.post('/affinities/cancel-request', cancelRequest)
    app.post('/affinities/create-request', createRequest)

    app.post('/constellation/apply', consteApply)
    app.post('/constellation/leave', consteLeave)
    app.post('/constellation/enter', consteEnter)
    app.post('/constellation/create', upload.single('file'), consteCreate)
    app.post('/constellation/invite-link', consteInviteLink)
    app.delete('/constellation/invite-link', consteInviteLinkDelete)
    
    app.post('/token/get', getToken)
    
    app.get('/notifications/read', notificationRead)
    app.get('/scraper', scrape)

    cronHourly(app)
})

const port = process.env.PORT || 80
server.listen(port, process.env.HOST || '0.0.0.0', () => {
    console.log(`============> API server listening on port ${port}`)
})