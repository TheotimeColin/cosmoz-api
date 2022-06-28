const { channelMessage } = require('../entities/index')
const { channel } = require('../entities/index')

 async function up () {
  try {
    let channels = await channel.model.find()

    await Promise.all(channels.map(async channel => {
      let messages = await channelMessage.model.find({
        channel: channel._id
      })

      if (!channel.lastMessage && messages[0]) {
        channel.lastMessage = messages[0]._id
      }

      channel.readBy = []

      return await channel.save()
    }))
  } catch (e) {
    console.error(e)
    return false
  }
}
/**
 * Make any changes that UNDO the up function side effects here (if possible)
 */
async function down () {
  // Write migration here
}

module.exports = { up, down };