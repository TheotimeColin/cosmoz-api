const { status } = require('../entities/index')
const { reaction } = require('../entities/index')

 async function up () {
  try {
    let statuses = await status.model.find()

    console.log(statuses)

    await Promise.all(statuses.map(async status => {
      let result = []

      result = await Promise.all(status.reactions.map(async r => {
        console.log(r)

        let newReaction = await reaction.model.create({
          type: r.type,
          owner: r.owner,
          status: status._id
        })

        return newReaction._id
      }))

      status.reactions = result

      return await status.save()
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